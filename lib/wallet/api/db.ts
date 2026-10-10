// Wallet API storage, separate from the share services' databases.
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
    hash text primary key, client_id text not null, user_op text not null);
  `)
  return handle
}

export const json = (value: unknown) => JSON.stringify(value, (_, v) => (typeof v === 'bigint' ? v.toString() : v))
