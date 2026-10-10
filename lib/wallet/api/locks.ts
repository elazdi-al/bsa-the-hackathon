// Swissquote's lost-phone policy: it locks the credentials on a phone reported lost or stolen, not the wallet.
// Nothing changes on-chain. A recovery that installs new credentials leaves the lock behind, inert.
import type { DatabaseSync } from "node:sqlite";
import { isAddressEqual, type Address, type Hex } from "viem";
import type { Passkey } from "../account.ts";
import { credentials } from "../env.ts";
import { store, type Wallet } from "./db.ts";
import { HttpError } from "./http.ts";

export type Lock = { signer: Address; passkey: Passkey; wallet: Address; lockedAt: number };
type Live = { signer: Address; passkey: Passkey };

export const LOCKED = "Swissquote locked this phone after it was reported lost.";

let db: DatabaseSync | undefined;

/** Created on first use, in Swissquote's own database. */
function locks() {
  if (db) return db;
  const swissquote = store().shares.db;
  swissquote.exec(`
    create table if not exists locks (
      signer text primary key collate nocase, wallet text not null collate nocase,
      passkey_x text not null, passkey_y text not null, locked_at integer not null);
    create index if not exists locks_by_wallet on locks (wallet);
  `);
  return (db = swissquote);
}

export function lock(wallet: Address, { signer, passkey }: Live) {
  locks().prepare("insert or replace into locks values (?, ?, ?, ?, ?)").run(signer, wallet, passkey.x, passkey.y, Date.now());
}

/** False if those credentials weren't locked. */
export function unlock(signer: Address): boolean {
  return locks().prepare("delete from locks where signer = ?").run(signer).changes === 1;
}

const same = (a: Hex, b: Hex) => a.toLowerCase() === b.toLowerCase();

/** The lock on the wallet's live credentials, if any. Reads them only when the wallet has locks and `live` isn't given. */
export async function lockOn(wallet: Wallet, live?: Live): Promise<Lock | undefined> {
  const rows = locks().prepare("select * from locks where wallet = ?").all(wallet.address) as {
    signer: Address;
    wallet: Address;
    passkey_x: Hex;
    passkey_y: Hex;
    locked_at: number;
  }[];
  if (!rows.length) return;
  const { signer, passkey } = live ?? (await credentials(wallet.address, () => wallet.config));
  const row = rows.find((r) => isAddressEqual(r.signer, signer) && same(r.passkey_x, passkey.x) && same(r.passkey_y, passkey.y));
  return row && { signer: row.signer, passkey: { x: row.passkey_x, y: row.passkey_y }, wallet: row.wallet, lockedAt: row.locked_at };
}

export async function refuseLocked(wallet: Wallet, live?: Live) {
  if (await lockOn(wallet, live)) throw new HttpError(423, LOCKED, { locked: true });
}
