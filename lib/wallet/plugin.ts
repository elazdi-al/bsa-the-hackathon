import { secp256k1_FROST as F } from "@noble/curves/secp256k1.js";
import type { AuthenticationResponseJSON } from "@simplewebauthn/server";
import { defineErrorCodes, type Auth } from "better-auth";
import { APIError, createAuthEndpoint, sessionMiddleware } from "better-auth/api";
import { generateRandomString, symmetricDecrypt, symmetricEncrypt } from "better-auth/crypto";
import type { BetterAuthPlugin } from "better-auth/types";
import * as z from "zod";
import {
  ID,
  PROVIDERS,
  SIGNERS,
  cosignShare,
  groupKey,
  pack,
  signTogether,
  unpack,
  type Commitments,
  type DkgSecret,
  type Key,
  type Packed,
  type Provider,
  type Round1,
  type Round2,
} from "./mpc.ts";
import {
  ERROR,
  ProtocolError,
  deploy,
  digest,
  submit,
  userAuthorized,
  type Call,
  type ChangeRequest,
  type Credentials,
  type Hex,
  type Proof,
  type Wallet,
} from "./protocol.ts";

export const WALLET_ERROR_CODES = defineErrorCodes({
  ...ERROR,
  NO_SUCH_WALLET: "No wallet is deployed at that address.",
  PASSKEY_NOT_YOURS: "That passkey does not belong to the signed-in user.",
  UNKNOWN_MPC_KEY: "No key shares exist for that MPC key.",
  UNKNOWN_PASSKEY: "That passkey is not registered.",
  KEYGEN_EXPIRED: "The key generation expired. Start again.",
  KEYGEN_MISMATCH: "The providers derived different group keys.",
  NO_MPC_NEEDED: "Cancel and finalize need no MPC signature.",
  WRONG_PARTICIPANT: "That package was not made by the phone's share.",
  CONFLICT: "The wallet changed underneath this call. Submit again.",
});

export type WalletOptions = {
  chainId?: number;
  onChangeRequested?: (event: { wallet: Wallet; request: ChangeRequest }) => void | Promise<void>;
};

type Context = Awaited<Auth["$context"]>;

type KeygenState = {
  phone: Round1;
  swissquote: { secret: DkgSecret; public: Round1; received: Round2 };
  backup: { secret: DkgSecret; public: Round1; received: Round2 };
};

const hex = z.custom<Hex>((v) => typeof v === "string" && /^0x[0-9a-f]*$/i.test(v));
const bytes = (n: number) => z.custom<Hex>((v) => typeof v === "string" && new RegExp(`^0x[0-9a-f]{${2 * n}}$`, "i").test(v));
const packed = <T>() => z.custom<Packed<T>>((v) => typeof v === "object" && v !== null);
const scope = { wallet: bytes(20), chainId: z.number().int(), version: z.number().int() };
const credentials = z.object({ mpcKey: bytes(33), passkey: z.object({ credentialId: z.string(), publicKey: z.string() }), recoveryKey: bytes(32) });
const change = { ...scope, id: z.string(), replacement: credentials, expiresAt: z.number().int() };
const call = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("execute"),
    ...scope,
    nonce: z.number().int(),
    to: bytes(20),
    value: z.string(),
    data: hex,
    fees: z.object({ maxFeePerGas: z.string(), maxPriorityFeePerGas: z.string(), callGasLimit: z.string() }),
    validAfter: z.number().int(),
    validUntil: z.number().int(),
  }),
  z.object({ type: z.literal("recover"), ...change }),
  z.object({ type: z.literal("maintain"), ...change }),
  z.object({ type: z.literal("cancel"), ...scope, id: z.string() }),
  z.object({ type: z.literal("finalize"), wallet: bytes(20), id: z.string() }),
]);
const proof = z.object({
  mpc: bytes(65).optional(),
  passkey: z.custom<AuthenticationResponseJSON>((v) => typeof v === "object" && v !== null).optional(),
  recovery: bytes(64).optional(),
});
const signed = z.object({ call, proof });

const schema = {
  wallet: {
    fields: {
      address: { type: "string", required: true, unique: true },
      userId: { type: "string", required: true, references: { model: "user", field: "id" }, index: true },
      state: { type: "string", required: true },
    },
  },
  walletShare: {
    fields: {
      groupKey: { type: "string", required: true, index: true },
      holder: { type: "string", required: true },
      share: { type: "string", required: true },
      // Nullable only so the column can be added to an already populated table; every row written here carries it.
      userId: { type: "string", required: false, references: { model: "user", field: "id" }, index: true },
    },
  },
} satisfies BetterAuthPlugin["schema"];

const now = () => Math.floor(Date.now() / 1000);

const seal = (context: Context, value: unknown) => symmetricEncrypt({ key: context.secret, data: JSON.stringify(pack(value)) });
const open = async <T>(context: Context, data: string): Promise<T> => unpack(JSON.parse(await symmetricDecrypt({ key: context.secret, data })));

function rp(context: Context): Wallet["rp"] {
  const url = new URL(context.baseURL);
  return { id: url.hostname, origin: url.origin };
}

async function loadWallet(context: Context, address: Hex): Promise<{ w: Wallet; state: string }> {
  const row = await context.adapter.findOne<{ state: string }>({ model: "wallet", where: [{ field: "address", value: address }] });
  if (!row) throw APIError.from("NOT_FOUND", WALLET_ERROR_CODES.NO_SUCH_WALLET);
  return { w: JSON.parse(row.state), state: row.state };
}

async function loadShare(context: Context, mpcKey: Hex, holder: Provider): Promise<Key> {
  const row = await context.adapter.findOne<{ share: string }>({
    model: "walletShare",
    where: [
      { field: "groupKey", value: mpcKey },
      { field: "holder", value: holder },
    ],
  });
  if (!row) throw APIError.from("NOT_FOUND", WALLET_ERROR_CODES.UNKNOWN_MPC_KEY);
  return open<Key>(context, row.share);
}

/** W can't tell whether anyone holds a replacement credential, so the providers check before signing for one. */
async function replaceable(context: Context, { mpcKey, passkey }: Credentials): Promise<void> {
  const shares = await context.adapter.findMany<{ holder: string }>({ model: "walletShare", where: [{ field: "groupKey", value: mpcKey }] });
  if (!PROVIDERS.every((holder) => shares.some((share) => share.holder === holder)))
    throw APIError.from("BAD_REQUEST", WALLET_ERROR_CODES.UNKNOWN_MPC_KEY);
  const registered = await context.adapter.findOne<{ publicKey: string }>({
    model: "passkey",
    where: [{ field: "credentialID", value: passkey.credentialId }],
  });
  if (registered?.publicKey !== passkey.publicKey) throw APIError.from("BAD_REQUEST", WALLET_ERROR_CODES.UNKNOWN_PASSKEY);
}

/** The gate both providers apply before lending a share: a user factor must already authorize this exact call. */
async function lendable(context: Context, call: Call, proof: Proof): Promise<Wallet> {
  if (call.type === "cancel" || call.type === "finalize") throw APIError.from("BAD_REQUEST", WALLET_ERROR_CODES.NO_MPC_NEEDED);
  const { w } = await loadWallet(context, call.wallet);
  if (!(await userAuthorized(w, call, proof))) throw APIError.from("UNAUTHORIZED", WALLET_ERROR_CODES.UNAUTHORIZED);
  if (call.type === "recover" || call.type === "maintain") await replaceable(context, call.replacement);
  return w;
}

export const wallet = (options: WalletOptions = {}) => {
  const chainId = options.chainId ?? 84532;

  const walletKeygen = createAuthEndpoint(
    "/wallet/keygen",
    { method: "POST", use: [sessionMiddleware], body: z.object({ round1: packed<Round1>() }) },
    async (ctx) => {
      const phone = unpack(ctx.body.round1);
      if (phone.identifier !== ID.phone) throw APIError.from("BAD_REQUEST", WALLET_ERROR_CODES.WRONG_PARTICIPANT);
      const s = F.DKG.round1(ID.swissquote, SIGNERS);
      const b = F.DKG.round1(ID.backup, SIGNERS);
      const fromS = F.DKG.round2(s.secret, [phone, b.public]);
      const fromB = F.DKG.round2(b.secret, [phone, s.public]);
      const state: KeygenState = {
        phone,
        swissquote: { secret: s.secret, public: s.public, received: fromB[ID.swissquote] },
        backup: { secret: b.secret, public: b.public, received: fromS[ID.backup] },
      };
      const token = generateRandomString(32);
      await ctx.context.internalAdapter.createVerificationValue({
        identifier: token,
        value: await seal(ctx.context, state),
        expiresAt: new Date(Date.now() + 5 * 60_000),
      });
      return ctx.json({
        token,
        round1: { swissquote: pack(s.public), backup: pack(b.public) },
        round2: { swissquote: pack(fromS[ID.phone]), backup: pack(fromB[ID.phone]) },
      });
    },
  );

  const walletKeygenFinish = createAuthEndpoint(
    "/wallet/keygen/finish",
    {
      method: "POST",
      use: [sessionMiddleware],
      body: z.object({ token: z.string(), round2: z.object({ swissquote: packed<Round2>(), backup: packed<Round2>() }) }),
    },
    async (ctx) => {
      const row = await ctx.context.internalAdapter.consumeVerificationValue(ctx.body.token);
      if (!row) throw APIError.from("BAD_REQUEST", WALLET_ERROR_CODES.KEYGEN_EXPIRED);
      const state = await open<KeygenState>(ctx.context, row.value);
      const keys = {
        swissquote: F.DKG.round3(state.swissquote.secret, [state.phone, state.backup.public], [unpack(ctx.body.round2.swissquote), state.swissquote.received]),
        backup: F.DKG.round3(state.backup.secret, [state.phone, state.swissquote.public], [unpack(ctx.body.round2.backup), state.backup.received]),
      };
      const mpcKey = groupKey(keys.swissquote);
      if (mpcKey !== groupKey(keys.backup)) throw APIError.from("BAD_REQUEST", WALLET_ERROR_CODES.KEYGEN_MISMATCH);
      for (const holder of PROVIDERS) {
        await ctx.context.adapter.create({
          model: "walletShare",
          data: { groupKey: mpcKey, holder, share: await seal(ctx.context, keys[holder]), userId: ctx.context.session.user.id },
        });
      }
      return ctx.json({ mpcKey });
    },
  );

  const walletCreate = createAuthEndpoint(
    "/wallet/create",
    { method: "POST", use: [sessionMiddleware], body: z.object({ mpcKey: bytes(33), credentialId: z.string(), recoveryKey: bytes(32) }) },
    async (ctx) => {
      const { mpcKey, credentialId, recoveryKey } = ctx.body;
      const userId = ctx.context.session.user.id;
      const passkey = await ctx.context.adapter.findOne<{ userId: string; publicKey: string }>({
        model: "passkey",
        where: [{ field: "credentialID", value: credentialId }],
      });
      if (passkey?.userId !== userId) throw APIError.from("UNAUTHORIZED", WALLET_ERROR_CODES.PASSKEY_NOT_YOURS);
      const w = deploy(chainId, rp(ctx.context), { mpcKey, passkey: { credentialId, publicKey: passkey.publicKey }, recoveryKey });
      const existing = await ctx.context.adapter.findOne<{ state: string }>({ model: "wallet", where: [{ field: "address", value: w.address }] });
      if (existing) return ctx.json(JSON.parse(existing.state) as Wallet);
      const shares = await ctx.context.adapter.findMany({
        model: "walletShare",
        where: [
          { field: "groupKey", value: mpcKey },
          { field: "userId", value: userId },
        ],
      });
      if (shares.length < PROVIDERS.length) throw APIError.from("BAD_REQUEST", WALLET_ERROR_CODES.UNKNOWN_MPC_KEY);
      await ctx.context.adapter.create({ model: "wallet", data: { address: w.address, userId, state: JSON.stringify(w) } });
      return ctx.json(w);
    },
  );

  const walletCosign = createAuthEndpoint(
    "/wallet/cosign",
    { method: "POST", body: signed.extend({ signer: z.enum(["swissquote", "backup"]), commitments: packed<Commitments>() }) },
    async (ctx) => {
      const { call, proof, signer } = ctx.body;
      const commitments = unpack(ctx.body.commitments);
      if (commitments.identifier !== ID.phone) throw APIError.from("BAD_REQUEST", WALLET_ERROR_CODES.WRONG_PARTICIPANT);
      const w = await lendable(ctx.context, call, proof);
      const key = await loadShare(ctx.context, w.credentials.mpcKey, signer);
      return ctx.json(pack(cosignShare(key, digest(call), commitments)));
    },
  );

  const walletProviderSign = createAuthEndpoint("/wallet/provider-sign", { method: "POST", body: signed }, async (ctx) => {
    const { call, proof } = ctx.body;
    const w = await lendable(ctx.context, call, proof);
    const keys = await Promise.all(PROVIDERS.map((holder) => loadShare(ctx.context, w.credentials.mpcKey, holder)));
    return ctx.json({ mpc: signTogether(digest(call), keys) });
  });

  const walletSubmit = createAuthEndpoint("/wallet/submit", { method: "POST", body: signed }, async (ctx) => {
    const { call, proof } = ctx.body;
    const { w, state } = await loadWallet(ctx.context, call.wallet);
    const next = await submit(w, call, proof, now()).catch((e: unknown) => {
      if (e instanceof ProtocolError) throw APIError.from(e.code === "UNAUTHORIZED" ? "UNAUTHORIZED" : "BAD_REQUEST", WALLET_ERROR_CODES[e.code]);
      throw e;
    });
    // ponytail: compare-and-swap on the whole state string is the block ordering; a per-wallet nonce column is the upgrade.
    const landed = await ctx.context.adapter.updateMany({
      model: "wallet",
      where: [
        { field: "address", value: w.address },
        { field: "state", value: state },
      ],
      update: { state: JSON.stringify(next) },
    });
    if (landed !== 1) throw APIError.from("CONFLICT", WALLET_ERROR_CODES.CONFLICT);
    if (next.pending && (call.type === "recover" || call.type === "maintain")) {
      const event = { wallet: next, request: next.pending };
      if (options.onChangeRequested) await options.onChangeRequested(event);
      else ctx.context.logger.info(`wallet ${next.address}: ${event.request.type} ${event.request.id} requested, finalizes after the delay`);
    }
    return ctx.json(next);
  });

  const walletState = createAuthEndpoint("/wallet/state", { method: "GET", query: z.object({ address: hex }) }, async (ctx) =>
    ctx.json((await loadWallet(ctx.context, ctx.query.address)).w),
  );

  return {
    id: "wallet",
    schema,
    endpoints: { walletKeygen, walletKeygenFinish, walletCreate, walletCosign, walletProviderSign, walletSubmit, walletState },
    $ERROR_CODES: WALLET_ERROR_CODES,
    options,
  } satisfies BetterAuthPlugin;
};
