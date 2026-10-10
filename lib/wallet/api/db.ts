// Swissquote's storage: its vault of B shares, the wallets it serves and the operations it prepared.
import type { Address, Hex } from "viem";
import type { RpcUserOperation } from "viem/account-abstraction";
import type { Config } from "../account.ts";
import { openVault } from "../vault.ts";

export type Wallet = { address: Address; config: Config };
export type Kind = "normal" | "recovery";

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
  `);
  const wallet = (row: { address: Address; config: string } | undefined): Wallet | undefined =>
    row && { address: row.address, config: JSON.parse(row.config) };

  return {
    shares: vault,
    addWallet({ address, config }: Wallet) {
      db.prepare("insert into wallets values (?, ?, ?, ?)").run(address, config.recoveryKey, JSON.stringify(config), Date.now());
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
  };
}
