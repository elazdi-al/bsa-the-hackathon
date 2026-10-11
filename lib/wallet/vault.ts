// Where a share holder keeps its shares: SQLite, each share AES-GCM sealed under the holder's
// key and bound to its signer. Swissquote (B) and the partner (C) each run their own.
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { Address, Hex } from "viem";
import type { Passkey } from "./account.ts";
import type { Share } from "./shamir.ts";

/** `recoveryKey` is set once the wallet key itself signed which recovery key may release its share. */
export type Stored = { signer: Address; passkey: Passkey; share: Share; recoveryKey?: Address };

// ponytail: the at-rest key comes from the environment; production keeps shares in an HSM.
export function openVault(file: string, keyHex: string | undefined) {
  if (!keyHex || !/^[0-9a-f]{64}$/i.test(keyHex)) throw new Error("The share key must be 32 bytes of hex. Run npm run local.");
  const key = Buffer.from(keyHex, "hex");
  mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file, { timeout: 5000 });
  const createShares = `create table if not exists shares (
    signer text primary key collate nocase, passkey_x text not null, passkey_y text not null,
    x integer not null, sealed text not null, created_at integer not null, recovery_key text collate nocase)`;

  const seal = (y: Hex, signer: Address) => {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv).setAAD(Buffer.from(signer.toLowerCase()));
    const body = Buffer.concat([cipher.update(y.slice(2), "hex"), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64");
  };
  const open = (sealed: string, signer: Address): Hex => {
    const raw = Buffer.from(sealed, "base64");
    const decipher = createDecipheriv("aes-256-gcm", key, raw.subarray(0, 12)).setAAD(Buffer.from(signer.toLowerCase()));
    decipher.setAuthTag(raw.subarray(12, 28));
    return `0x${Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("hex")}`;
  };

  // Existing demos used either a packed share with client_id, or this schema without
  // recovery_key. Migrate in one transaction and keep the packed originals for reference.
  try {
    db.exec("begin immediate");
    db.exec(createShares);
    const columns = new Set((db.prepare("pragma table_info(shares)").all() as { name: string }[]).map((column) => column.name));
    if (columns.has("share") && columns.has("client_id")) {
      const rows = db.prepare("select signer, passkey_x, passkey_y, share, created_at from shares").all() as {
        signer: Address; passkey_x: Hex; passkey_y: Hex; share: string; created_at: number;
      }[];
      db.exec("alter table shares rename to shares_legacy");
      db.exec(createShares);
      const insert = db.prepare("insert into shares (signer, passkey_x, passkey_y, x, sealed, created_at) values (?, ?, ?, ?, ?, ?)");
      for (const row of rows) {
        const raw = Buffer.from(row.share, "base64");
        // The old service encrypted the packed hex string using the original address case.
        const decipher = createDecipheriv("aes-256-gcm", key, raw.subarray(0, 12)).setAAD(Buffer.from(row.signer));
        decipher.setAuthTag(raw.subarray(12, 28));
        const packed = Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString();
        if (!/^0x0[123][0-9a-f]{64}$/i.test(packed)) throw new Error("The legacy vault contains an invalid share.");
        const x = Number.parseInt(packed.slice(2, 4), 16);
        insert.run(row.signer, row.passkey_x, row.passkey_y, x, seal(`0x${packed.slice(4)}`, row.signer), row.created_at);
      }
    } else if (!columns.has("recovery_key")) {
      db.exec("alter table shares add column recovery_key text collate nocase");
    }
    db.exec("commit");
  } catch (error) {
    try { db.exec("rollback"); } catch {}
    db.close();
    throw error;
  }

  return {
    db,
    put({ signer, passkey, share }: Stored) {
      db.prepare("insert into shares (signer, passkey_x, passkey_y, x, sealed, created_at) values (?, ?, ?, ?, ?, ?)").run(
        signer, passkey.x, passkey.y, share.x, seal(share.y, signer), Date.now(),
      );
    },
    /** False if the share is unknown or already bound to another recovery key. */
    bind(signer: Address, recoveryKey: Address): boolean {
      const { changes } = db
        .prepare("update shares set recovery_key = ? where signer = ? and (recovery_key is null or recovery_key = ?)")
        .run(recoveryKey, signer, recoveryKey);
      return changes === 1;
    },
    get(signer: Address): Stored | undefined {
      const row = db.prepare("select * from shares where signer = ?").get(signer) as
        | { signer: Address; passkey_x: Hex; passkey_y: Hex; x: Share["x"]; sealed: string; recovery_key: Address | null }
        | undefined;
      return (
        row && {
          signer: row.signer,
          passkey: { x: row.passkey_x, y: row.passkey_y },
          share: { x: row.x, y: open(row.sealed, row.signer) },
          recoveryKey: row.recovery_key ?? undefined,
        }
      );
    },
  };
}
