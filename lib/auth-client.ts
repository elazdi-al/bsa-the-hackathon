import { passkeyClient } from "@better-auth/passkey/client";
import { createAuthClient } from "better-auth/client";
import { walletClient } from "./wallet/client.ts";
import type { Hex } from "./wallet/protocol.ts";

export const authClient = createAuthClient({ plugins: [passkeyClient(), walletClient()] });

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

async function attempt<T>(run: () => Promise<T>, error: string): Promise<Result<T>> {
  try {
    return { ok: true, value: await run() };
  } catch {
    return { ok: false, error };
  }
}

/** Registers a platform passkey (A) and signs in with it. Resolves to its credential id. */
export async function createPasskey(): Promise<Result<string>> {
  const { data, error } = await authClient.passkey.addPasskey({ name: "Fuse", authenticatorAttachment: "platform", createSession: true });
  // The browser's own cancel and timeout text is a spec link, not copy.
  return error || !data ? { ok: false, error: "Your passkey wasn't created. Try again." } : { ok: true, value: data.credentialID };
}

/** Runs the phone's side of the DKG with Swissquote and the backup service. Keeps P on this device and resolves to the group key. */
export function splitWalletKey(): Promise<Result<Hex>> {
  return attempt(() => authClient.wallet.generateKey(), "Your Wallet Key wasn't split. Try again.");
}

/** Makes R on this device. Only `publicKey` is ever sent anywhere. */
export function createRecoveryKey(): { secret: Hex; publicKey: Hex } {
  return authClient.wallet.createRecoveryKey();
}

/** Deploys W with the three public credentials. */
export function registerWallet(keys: { credentialId: string; mpcKey: Hex; recoveryKey: Hex }): Promise<Result<{ address: Hex }>> {
  return attempt(async () => {
    const { data, error } = await authClient.wallet.create(keys);
    if (error || !data) throw error;
    return { address: data.address };
  }, "Your wallet wasn't set up. Try again.");
}
