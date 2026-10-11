import assert from "node:assert/strict";
import { createCipheriv, randomBytes } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test, type TestContext } from "node:test";
import type { Address, Hex } from "viem";
import { openVault } from "../../lib/wallet/vault.ts";

const signer: Address = "0xd25F1b678eD7f7345401509d885004C772781E7a";
const recoveryKey: Address = "0x2f1245cB43123fbA3f63e046FC334F296ff67181";
const passkey = { x: `0x${"11".repeat(32)}` as Hex, y: `0x${"22".repeat(32)}` as Hex };
const share = { x: 2 as const, y: `0x${"33".repeat(32)}` as Hex };
const key = "44".repeat(32);

function fixture(t: TestContext) {
  const directory = mkdtempSync(join(tmpdir(), "wallet-vault-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return join(directory, "shares.db");
}

function encrypted(value: string, aad: string, hex = key) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", Buffer.from(hex, "hex"), iv).setAAD(Buffer.from(aad));
  const body = Buffer.concat([cipher.update(value), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64");
}

function legacy(file: string) {
  const db = new DatabaseSync(file);
  db.exec(`create table shares (
    signer text primary key, client_id text not null, passkey_x text not null,
    passkey_y text not null, share text not null, created_at integer not null)`);
  db.prepare("insert into shares values (?, ?, ?, ?, ?, ?)").run(
    signer, "legacy-client", passkey.x, passkey.y, encrypted(`0x02${share.y.slice(2)}`, signer), 1234,
  );
  db.close();
}

test("fresh vault stores encrypted shares and keeps the recovery binding across reopen", (t) => {
  const file = fixture(t);
  const vault = openVault(file, key);
  vault.put({ signer, passkey, share });
  assert.deepEqual(vault.get(signer), { signer, passkey, share, recoveryKey: undefined });
  assert.equal(vault.bind(signer, recoveryKey), true);
  assert.equal(vault.bind(signer, signer), false);
  assert.ok(!(vault.db.prepare("select sealed from shares").get() as { sealed: string }).sealed.includes(share.y));
  vault.db.close();
  const reopened = openVault(file, key);
  t.after(() => reopened.db.close());
  assert.deepEqual(reopened.get(signer.toLowerCase() as Address), { signer, passkey, share, recoveryKey });
});

test("packed legacy shares migrate without losing their value, timestamp, or encrypted original", (t) => {
  const file = fixture(t);
  legacy(file);
  const vault = openVault(file, key);
  assert.deepEqual(vault.get(signer), { signer, passkey, share, recoveryKey: undefined });
  assert.equal(vault.db.prepare("select created_at from shares").get()?.created_at, 1234);
  assert.equal(vault.db.prepare("select count(*) as count from shares_legacy").get()?.count, 1);
  assert.equal(vault.bind(signer, recoveryKey), true);
  vault.put({ signer: recoveryKey, passkey, share: { ...share, x: 3 } });
  vault.db.close();
  const reopened = openVault(file, key);
  t.after(() => reopened.db.close());
  assert.equal(reopened.get(signer)?.recoveryKey, recoveryKey);
  assert.equal(reopened.get(recoveryKey)?.share.x, 3);
});

test("vaults without recovery_key retain their encrypted shares when the column is added", (t) => {
  const file = fixture(t);
  const original = openVault(file, key);
  original.put({ signer, passkey, share });
  original.db.exec("alter table shares drop column recovery_key");
  original.db.close();
  const upgraded = openVault(file, key);
  t.after(() => upgraded.db.close());
  assert.deepEqual(upgraded.get(signer), { signer, passkey, share, recoveryKey: undefined });
  assert.equal(upgraded.bind(signer, recoveryKey), true);
});

test("failed legacy decryption rolls back the entire schema migration", (t) => {
  const file = fixture(t);
  legacy(file);
  assert.throws(() => openVault(file, "55".repeat(32)));
  const db = new DatabaseSync(file);
  t.after(() => db.close());
  assert.ok((db.prepare("pragma table_info(shares)").all() as { name: string }[]).some((column) => column.name === "client_id"));
  assert.equal(db.prepare("select count(*) as count from shares").get()?.count, 1);
  assert.equal(db.prepare("select name from sqlite_master where name='shares_legacy'").get(), undefined);
});
