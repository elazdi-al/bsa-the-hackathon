import { startAuthentication } from "@simplewebauthn/browser";
import type { BetterAuthClientPlugin } from "better-auth/client";
import {
  cosignWith,
  createRecoveryKey,
  groupKey,
  pack,
  phoneKeygen,
  signWithRecoveryKey,
  unpack,
  type CosignReply,
  type Key,
  type KeygenTransport,
  type Packed,
  type Provider,
} from "./mpc.ts";
import type { wallet } from "./plugin.ts";
import { RULES, challenge, digest, type Call, type Hex, type Proof, type Wallet } from "./protocol.ts";

const PHONE_SHARE = "fuse.wallet.phone-share";

// ponytail: localStorage leaves P readable by any script on the origin; wrap it with a key from the passkey's PRF extension, or the Secure Enclave in the native app.
function phoneShare(): Key {
  const raw = localStorage.getItem(PHONE_SHARE);
  if (!raw) throw new Error("This device holds no wallet share.");
  return unpack(JSON.parse(raw));
}

const needsMpc = (type: Call["type"]) => RULES[type].some((factors: readonly string[]) => factors.includes("mpc"));

export const walletClient = () =>
  ({
    id: "wallet",
    $InferServerPlugin: {} as ReturnType<typeof wallet>,
    pathMethods: { "/wallet/state": "GET" },
    getActions: ($fetch) => {
      async function request<T>(path: string, init: { method: "POST"; body: unknown } | { method: "GET"; query: Record<string, string> }): Promise<T> {
        const { data, error } = await $fetch<T>(path, init);
        if (error) throw error;
        return data as T;
      }
      const post = <T>(path: string, body: unknown) => request<T>(path, { method: "POST", body });
      return {
        wallet: {
          /** Runs P's side of the DKG and keeps P on this device. Resolves to the group key. */
          async generateKey(): Promise<Hex> {
            const key = await phoneKeygen({
              keygen: (round1) => post<Awaited<ReturnType<KeygenTransport["keygen"]>>>("/wallet/keygen", { round1 }),
              finish: (token, round2) => post<Awaited<ReturnType<KeygenTransport["finish"]>>>("/wallet/keygen/finish", { token, round2 }),
            });
            localStorage.setItem(PHONE_SHARE, JSON.stringify(pack(key)));
            return groupKey(key);
          },
          /** A over the call's digest, plus P with `signer` where the call needs an MPC signature. */
          async authorize(call: Call, { signer = "swissquote" }: { signer?: Provider } = {}): Promise<Proof> {
            const w = await request<Wallet>("/wallet/state", { method: "GET", query: { address: call.wallet } });
            const message = digest(call);
            const passkey = await startAuthentication({
              optionsJSON: {
                challenge: challenge(message),
                rpId: w.rp.id,
                allowCredentials: [{ id: w.credentials.passkey.credentialId, type: "public-key" }],
                userVerification: "required",
              },
            });
            if (!needsMpc(call.type)) return { passkey };
            const mpc = await cosignWith(phoneShare(), message, async (commitments) =>
              unpack(await post<Packed<CosignReply>>("/wallet/cosign", { signer, call, proof: { passkey }, commitments: pack(commitments) })),
            );
            return { mpc, passkey };
          },
          /** R over the call's digest, plus S+B where the call needs an MPC signature. The phone-lost path. */
          async authorizeWithRecoveryKey(call: Call, secret: Hex): Promise<Proof> {
            const recovery = signWithRecoveryKey(digest(call), secret);
            if (!needsMpc(call.type)) return { recovery };
            const { mpc } = await post<{ mpc: Hex }>("/wallet/provider-sign", { call, proof: { recovery } });
            return { mpc, recovery };
          },
          createRecoveryKey,
        },
      };
    },
  }) satisfies BetterAuthClientPlugin;
