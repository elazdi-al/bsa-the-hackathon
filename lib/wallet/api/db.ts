// Swissquote's storage: its vault of B shares, the wallets it serves, the operations it prepared and the payments
// it holds, and its clients: their KYC records, their app sessions and the wallets they own.
import { randomBytes } from "node:crypto";
import type { Address, Hex } from "viem";
import type { RpcUserOperation } from "viem/account-abstraction";
import type { Config } from "../account.ts";
import { openVault } from "../vault.ts";

export type Wallet = { address: Address; config: Config };
export type Kind = "normal" | "recovery";
/** A signed payment Swissquote holds until `releaseAt`, in chain seconds. `stopped`: why it will not leave. */
export type Held = { hash: Hex; userOp: RpcUserOperation<"0.7">; releaseAt: number; stopped: string | null };
/** A client's KYC record. `face` stands in for the face template enrolled when they opened the account. */
export type Client = { number: string; name: string; birthDate: string; document: string; face: string };
/** The client a wallet was created for, and the wallet key's signature on the statement naming both. */
export type Owner = { client: string; signature: Hex; createdAt: number };

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
    create table if not exists held (
      hash text primary key, wallet text not null collate nocase, user_op text not null,
      release_at integer not null, stopped text);
    create table if not exists clients (number text primary key, kyc text not null, created_at integer not null);
    create table if not exists sessions (token text primary key, client text not null, created_at integer not null);
    create table if not exists owners (
      wallet text primary key collate nocase, client text not null, signature text not null, created_at integer not null);
  `);
  const wallet = (row: { address: Address; config: string } | undefined): Wallet | undefined =>
    row && { address: row.address, config: JSON.parse(row.config) };
  type HeldRow = { hash: Hex; user_op: string; release_at: number; stopped: string | null };
  const held = (row: HeldRow): Held => ({ hash: row.hash, userOp: JSON.parse(row.user_op), releaseAt: row.release_at, stopped: row.stopped });

  return {
    shares: vault,
    /** Converges on a retry: a wallet registered without its owner, as after a crash, gets it. */
    addWallet({ address, config }: Wallet, owner: Pick<Owner, "client" | "signature">) {
      db.prepare("insert or ignore into wallets values (?, ?, ?, ?)").run(address, config.recoveryKey, JSON.stringify(config), Date.now());
      db.prepare("insert or ignore into owners values (?, ?, ?, ?)").run(address, owner.client, owner.signature, Date.now());
    },
    owner(wallet: Address): Owner | undefined {
      const row = db.prepare("select * from owners where wallet = ?").get(wallet) as { client: string; signature: Hex; created_at: number } | undefined;
      return row && { client: row.client, signature: row.signature, createdAt: row.created_at };
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
    hold(hash: Hex, wallet: Address, userOp: RpcUserOperation<"0.7">, releaseAt: number) {
      db.prepare("insert into held values (?, ?, ?, ?, null)").run(hash, wallet, JSON.stringify(userOp), releaseAt);
    },
    held: (wallet: Address) => (db.prepare("select * from held where wallet = ? order by release_at").all(wallet) as HeldRow[]).map(held),
    heldPayment(hash: Hex, wallet: Address) {
      const row = db.prepare("select * from held where hash = ? and wallet = ?").get(hash, wallet) as HeldRow | undefined;
      return row && held(row);
    },
    stop(hash: Hex, reason: string) {
      db.prepare("update held set stopped = ? where hash = ?").run(reason, hash);
    },
    unhold(hash: Hex) {
      db.prepare("delete from held where hash = ?").run(hash);
    },
  };
}
