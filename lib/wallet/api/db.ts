// Swissquote's storage: its vault of B shares, the wallets it serves, the operations it prepared, and its
// clients: their app sessions, the wallets they own and the Plus they paid for.
import { randomBytes } from "node:crypto";
import type { Address, Hex } from "viem";
import type { RpcUserOperation } from "viem/account-abstraction";
import type * as z from "zod";
import type { Config } from "../account.ts";
import type { assertion } from "../schema.ts";
import { openVault } from "../vault.ts";

export type Wallet = { address: Address; config: Config };
export type Kind = "normal" | "recovery";
/** A Swissquote client, as far as the wallet needs one. */
export type Client = { number: string };
/** The client who linked a wallet, and the wallet passkey's assertion, with Face ID, over the statement naming both. */
export type Owner = { client: string; assertion: z.infer<typeof assertion>; createdAt: number };

let handle: ReturnType<typeof open> | undefined;

/** Opened on first use, so builds never touch it. */
export function store() {
  return (handle ??= open());
}

function open() {
  const vault = openVault(process.env.SWISSQUOTE_DB ?? "data/swissquote.db", process.env.SWISSQUOTE_SHARE_KEY);
  const { db } = vault;
  db.exec(`
    create table if not exists wallets (
      address text primary key collate nocase, recovery_key text not null collate nocase,
      config text not null, created_at integer not null);
    create index if not exists wallets_by_recovery_key on wallets (recovery_key);
    create table if not exists operations (
      hash text primary key, wallet text not null collate nocase, kind text not null,
      user_op text not null, created_at integer not null);
    create table if not exists clients (number text primary key, kyc text not null, created_at integer not null);
    create table if not exists sessions (token text primary key, client text not null, created_at integer not null);
    create table if not exists links (
      wallet text primary key collate nocase, client text not null, assertion text not null, created_at integer not null);
    create table if not exists plus (transaction_hash text primary key collate nocase, client text not null, until integer not null);
  `);
  const wallet = (row: { address: Address; config: string } | undefined): Wallet | undefined =>
    row && { address: row.address, config: JSON.parse(row.config) };

  return {
    shares: vault,
    addWallet({ address, config }: Wallet) {
      db.prepare("insert or ignore into wallets values (?, ?, ?, ?)").run(address, config.recoveryKey, JSON.stringify(config), Date.now());
    },
    /** Links the wallet to the client once; there is no unlinking. Resolves to the owner it has now, which may be another client. */
    link(wallet: Address, owner: Pick<Owner, "client" | "assertion">): Owner {
      db.prepare("insert or ignore into links values (?, ?, ?, ?)").run(wallet, owner.client, JSON.stringify(owner.assertion), Date.now());
      return this.owner(wallet)!;
    },
    owner(wallet: Address): Owner | undefined {
      const row = db.prepare("select * from links where wallet = ?").get(wallet) as { client: string; assertion: string; created_at: number } | undefined;
      return row && { client: row.client, assertion: JSON.parse(row.assertion), createdAt: row.created_at };
    },
    /** False if the client number is taken. */
    addClient(client: Client): boolean {
      return db.prepare("insert or ignore into clients values (?, ?, ?)").run(client.number, JSON.stringify(client), Date.now()).changes === 1;
    },
    client(number: string): Client | undefined {
      const row = db.prepare("select kyc from clients where number = ?").get(number) as { kyc: string } | undefined;
      return row && JSON.parse(row.kyc);
    },
    /** A new app session for the client, as its token. */
    addSession(client: string): string {
      const token = randomBytes(32).toString("hex");
      db.prepare("insert into sessions values (?, ?, ?)").run(token, client, Date.now());
      return token;
    },
    clientBySession(token: string): Client | undefined {
      const row = db.prepare("select kyc from sessions join clients on clients.number = sessions.client where token = ?").get(token) as
        | { kyc: string }
        | undefined;
      return row && JSON.parse(row.kyc);
    },
    /**
     * Records a payment for Swissquote Plus, once per transaction: it runs `period` more from when the client's Plus
     * ends, or from `now` if it isn't running. Resolves to the new end, or undefined if the transaction was claimed
     * before. Chain seconds. One statement, so two claims can't both read the same end.
     */
    addPlus(transactionHash: Hex, client: string, now: number, period: number): number | undefined {
      const added = db
        .prepare("insert or ignore into plus select ?, ?, max(coalesce(max(until), 0), ?) + ? from plus where client = ?")
        .run(transactionHash, client, now, period, client).changes;
      return added ? this.plusUntil(client) : undefined;
    },
    /** When the client's Plus ends, in chain seconds; undefined if they never bought it. */
    plusUntil(client: string): number | undefined {
      return (db.prepare("select max(until) as until from plus where client = ?").get(client) as { until: number | null }).until ?? undefined;
    },
    wallet: (address: Address) => wallet(db.prepare("select * from wallets where address = ?").get(address) as never),
    walletByRecoveryKey: (recoveryKey: Address) =>
      wallet(db.prepare("select * from wallets where recovery_key = ? order by created_at desc").get(recoveryKey) as never),
    addOperation(hash: Hex, wallet: Address, kind: Kind, userOp: RpcUserOperation<"0.7">) {
      db.prepare("insert or replace into operations values (?, ?, ?, ?, ?)").run(hash, wallet, kind, JSON.stringify(userOp), Date.now());
    },
    operation(hash: Hex, wallet: Address) {
      const row = db.prepare("select * from operations where hash = ? and wallet = ?").get(hash, wallet) as
        | { kind: Kind; user_op: string; created_at: number }
        | undefined;
      return row && { kind: row.kind, userOp: JSON.parse(row.user_op) as RpcUserOperation<"0.7">, createdAt: row.created_at };
    },
    removeOperation(hash: Hex) {
      db.prepare("delete from operations where hash = ?").run(hash);
    },
    /** Forgets operations prepared before `before`, in ms: their sponsorship expired unsubmitted. */
    pruneOperations(before: number) {
      db.prepare("delete from operations where created_at < ?").run(before);
    },
  };
}
