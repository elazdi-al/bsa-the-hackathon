// Wallet API storage, separate from the signer services' databases.
import { createHash } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'

let handle: DatabaseSync | undefined

/** Opened on first use, so builds never touch it. */
export function db() {
  if (handle) return handle
  mkdirSync('data', { recursive: true })
  handle = new DatabaseSync(process.env.WALLET_API_DB ?? 'data/wallet-api.db', { timeout: 5000 })
  handle.exec(`
  create table if not exists wallets (
    client_id text primary key, address text not null, signer text not null, config text not null);
  create table if not exists operations (
    hash text primary key, client_id text not null, kind text not null, user_op text not null, created_at integer not null);
  create table if not exists sponsorships (
    client_id text not null, month text not null, count integer not null, primary key (client_id, month));
  create table if not exists identity_checks (client_id text primary key, passed_at integer not null);
  create table if not exists audit (
    id integer primary key, at integer not null, client_id text, event text not null, detail text not null, hash text not null);
  `)
  return handle
}

export const json = (value: unknown) => JSON.stringify(value, (_, v) => (typeof v === 'bigint' ? v.toString() : v))

/** Hash-chained audit log: each entry commits to the previous one (AMLA record keeping). */
export function audit(clientId: string | null, event: string, detail: unknown = {}) {
  const prev = db().prepare('select hash from audit order by id desc limit 1').get() as { hash: string } | undefined
  const at = Date.now()
  const body = json({ prev: prev?.hash ?? '', at, clientId, event, detail })
  const hash = createHash('sha256').update(body).digest('hex')
  db().prepare('insert into audit (at, client_id, event, detail, hash) values (?, ?, ?, ?, ?)').run(at, clientId, event, json(detail), hash)
}
