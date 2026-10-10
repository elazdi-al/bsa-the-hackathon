// Where a share holder keeps its shares: SQLite, each share AES-GCM sealed under the holder's
// key and bound to its signer. Swissquote (B) and the partner (C) each run their own.
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import type { Address, Hex } from "viem";
import type { Passkey } from "./account.ts";
import type { Share } from "./shamir.ts";

export type Stored = { signer: Address; passkey: Passkey; share: Share };

// ponytail: the at-rest key comes from the environment; production keeps shares in an HSM.
export function openVault(file: string, keyHex: string | undefined) {
  if (!keyHex || !/^[0-9a-f]{64}$/i.test(keyHex)) throw new Error("The share key must be 32 bytes of hex. Run npm run local.");
  const key = Buffer.from(keyHex, "hex");
  mkdirSync("data", { recursive: true });
  const db = new DatabaseSync(file, { timeout: 5000 });
  db.exec(`create table if not exists shares (
    signer text primary key collate nocase, passkey_x text not null, passkey_y text not null,
    x integer not null, sealed text not null, created_at integer not null)`);

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

  return {
    db,
    put({ signer, passkey, share }: Stored) {
      db.prepare("insert into shares values (?, ?, ?, ?, ?, ?)").run(signer, passkey.x, passkey.y, share.x, seal(share.y, signer), Date.now());
    },
    get(signer: Address): Stored | undefined {
      const row = db.prepare("select * from shares where signer = ?").get(signer) as
        | { signer: Address; passkey_x: Hex; passkey_y: Hex; x: Share["x"]; sealed: string }
        | undefined;
      return row && { signer: row.signer, passkey: { x: row.passkey_x, y: row.passkey_y }, share: { x: row.x, y: open(row.sealed, row.signer) } };
    },
  };
}
