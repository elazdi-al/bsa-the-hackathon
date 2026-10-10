// The wallet protocol and its Better Auth plugin, end to end: `node lib/wallet/wallet.check.mjs`
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { describe, test } from "node:test";
import { passkey } from "@better-auth/passkey";
import { p256 } from "@noble/curves/nist.js";
import { secp256k1_FROST as F } from "@noble/curves/secp256k1.js";
import { bytesToHex } from "@noble/curves/utils.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { isoBase64URL, isoCBOR } from "@simplewebauthn/server/helpers";
import { betterAuth } from "better-auth";
import { symmetricDecrypt } from "better-auth/crypto";
import { getMigrations } from "better-auth/db/migration";
import { ID, SIGNERS, cosignWith, createRecoveryKey, groupKey, pack, phoneKeygen, signTogether, signWithRecoveryKey, unpack } from "./mpc.ts";
import { wallet } from "./plugin.ts";
import { ProtocolError, RECOVERY_DELAY, RULES, deploy, digest, submit } from "./protocol.ts";

const CHAIN = 84532;
const RP = { id: "localhost", origin: "http://localhost:3000" };
const T0 = 1_800_000_000;
const utf8 = (s) => new TextEncoder().encode(s);

function authenticator() {
  const secret = p256.utils.randomSecretKey();
  const point = p256.getPublicKey(secret, false);
  const cose = isoCBOR.encode(new Map([[1, 2], [3, -7], [-1, 1], [-2, point.slice(1, 33)], [-3, point.slice(33)]]));
  const credentialId = isoBase64URL.fromBuffer(crypto.getRandomValues(new Uint8Array(16)));
  return {
    passkey: { credentialId, publicKey: Buffer.from(cose).toString("base64") },
    cose,
    assert(message, { origin = RP.origin, rpId = RP.id, uv = true } = {}) {
      const authData = new Uint8Array(37);
      authData.set(sha256(utf8(rpId)));
      authData[32] = uv ? 0x05 : 0x01;
      const clientData = utf8(JSON.stringify({ type: "webauthn.get", challenge: isoBase64URL.fromBuffer(message), origin }));
      const signature = p256.sign(new Uint8Array([...authData, ...sha256(clientData)]), secret, { prehash: true, format: "der" });
      return {
        id: credentialId,
        rawId: credentialId,
        type: "public-key",
        clientExtensionResults: {},
        response: {
          authenticatorData: isoBase64URL.fromBuffer(authData),
          clientDataJSON: isoBase64URL.fromBuffer(clientData),
          signature: isoBase64URL.fromBuffer(signature),
        },
      };
    },
  };
}

function dealShares() {
  const deal = F.trustedDealer(SIGNERS, [ID.phone, ID.swissquote, ID.backup]);
  const key = (who) => ({ public: deal.public, secret: deal.secretShares[ID[who]] });
  return { phone: key("phone"), swissquote: key("swissquote"), backup: key("backup") };
}

function setup(chainId = CHAIN) {
  const shares = dealShares();
  const A = authenticator();
  const R = createRecoveryKey();
  const credentials = { mpcKey: groupKey(shares.phone), passkey: A.passkey, recoveryKey: R.publicKey };
  return { shares, A, R, credentials, w: deploy(chainId, RP, credentials) };
}

const execute = (w, over = {}) => ({
  type: "execute",
  wallet: w.address,
  chainId: w.chainId,
  version: w.version,
  nonce: w.nonce,
  to: `0x${"11".repeat(20)}`,
  value: "1000",
  data: "0x",
  fees: { maxFeePerGas: "100", maxPriorityFeePerGas: "1", callGasLimit: "21000" },
  validAfter: T0 - 60,
  validUntil: T0 + 600,
  ...over,
});
const change = (type, w, replacement, over = {}) => ({
  type,
  wallet: w.address,
  chainId: w.chainId,
  version: w.version,
  id: "req-1",
  replacement,
  expiresAt: T0 + 3 * RECOVERY_DELAY,
  ...over,
});
const cancel = (w, id) => ({ type: "cancel", wallet: w.address, chainId: w.chainId, version: w.version, id });
const finalize = (w, id) => ({ type: "finalize", wallet: w.address, id });

function prove(call, { mpc, passkey, recovery, assertion } = {}) {
  const message = digest(call);
  const proof = {};
  if (mpc) proof.mpc = signTogether(message, mpc);
  if (passkey) proof.passkey = passkey.assert(message, assertion);
  if (recovery) proof.recovery = signWithRecoveryKey(message, recovery.secret);
  return proof;
}

const rejects = (promise, code) => assert.rejects(promise, { name: "ProtocolError", code });

async function pendingRecovery(now = T0) {
  const t = setup();
  const fresh = setup();
  const request = change("recover", t.w, fresh.credentials);
  const w = await submit(t.w, request, prove(request, { mpc: [t.shares.swissquote, t.shares.backup], recovery: t.R }), now);
  return { ...t, fresh, request, w };
}

describe("outcomes", () => {
  test("P+S+A executes and the nonce advances", async () => {
    const { shares, A, w } = setup();
    const call = execute(w);
    const next = await submit(w, call, prove(call, { mpc: [shares.phone, shares.swissquote], passkey: A }), T0);
    assert.equal(next.nonce, 1);
    assert.equal(w.nonce, 0, "submit returns a new state instead of mutating");
  });

  test("P+B+A executes", async () => {
    const { shares, A, w } = setup();
    const call = execute(w);
    assert.equal((await submit(w, call, prove(call, { mpc: [shares.phone, shares.backup], passkey: A }), T0)).nonce, 1);
  });

  test("S+B+A executes", async () => {
    const { shares, A, w } = setup();
    const call = execute(w);
    assert.equal((await submit(w, call, prove(call, { mpc: [shares.swissquote, shares.backup], passkey: A }), T0)).nonce, 1);
  });

  test("P plus a local copy of B plus A executes with no provider involved", async () => {
    const { shares, A, w } = setup();
    const localBackup = structuredClone(shares.backup);
    const call = execute(w);
    assert.equal((await submit(w, call, prove(call, { mpc: [shares.phone, localBackup], passkey: A }), T0)).nonce, 1);
  });

  test("one share alone cannot produce a signature", () => {
    const { shares, w } = setup();
    assert.throws(() => signTogether(digest(execute(w)), [shares.phone]));
  });

  test("R plus one remaining share cannot start recovery", async () => {
    const { shares, R, w } = setup();
    const request = change("recover", w, setup().credentials);
    assert.throws(() => signTogether(digest(request), [shares.backup]));
    await rejects(submit(w, request, prove(request, { recovery: R }), T0), "UNAUTHORIZED");
  });

  test("colluding S+B: MPC alone cannot execute, maintain, recover or cancel", async () => {
    const { shares, fresh, request, w } = await pendingRecovery();
    const quorum = [shares.swissquote, shares.backup];
    const maintain = change("maintain", w, fresh.credentials, { id: "req-2" });
    const recover = change("recover", w, fresh.credentials, { id: "req-3" });
    const cancelled = cancel(w, request.id);
    await rejects(submit(w, cancelled, prove(cancelled, { mpc: quorum }), T0), "UNAUTHORIZED");
    const resumed = { ...w, pending: null };
    for (const call of [execute(resumed), maintain, recover]) {
      await rejects(submit(resumed, call, prove(call, { mpc: quorum }), T0), "UNAUTHORIZED");
    }
  });

  test("colluding S+B plus R cannot execute", async () => {
    const { shares, R, w } = setup();
    const call = execute(w);
    await rejects(submit(w, call, prove(call, { mpc: [shares.swissquote, shares.backup], recovery: R }), T0), "UNAUTHORIZED");
  });
});

describe("binding", () => {
  test("a passkey assertion over one call with an MPC signature over another is rejected", async () => {
    const { shares, A, w } = setup();
    const mpc = [shares.phone, shares.swissquote];
    const a = execute(w);
    const b = execute(w, { to: `0x${"22".repeat(20)}` });
    const proof = { mpc: prove(b, { mpc }).mpc, passkey: prove(a, { passkey: A }).passkey };
    await rejects(submit(w, a, proof, T0), "UNAUTHORIZED");
    await rejects(submit(w, b, proof, T0), "UNAUTHORIZED");
  });

  test("changing to, value, data, fees or validity after signing is rejected", async () => {
    const { shares, A, w } = setup();
    const call = execute(w);
    const proof = prove(call, { mpc: [shares.phone, shares.swissquote], passkey: A });
    const edits = {
      to: `0x${"22".repeat(20)}`,
      value: "1001",
      data: "0x01",
      fees: { ...call.fees, callGasLimit: "21001" },
      validAfter: call.validAfter - 1,
      validUntil: call.validUntil + 1,
    };
    for (const [field, value] of Object.entries(edits)) {
      await rejects(submit(w, { ...call, [field]: value }, proof, T0), "UNAUTHORIZED");
    }
  });

  test("changing wallet, chainId or nonce after signing is rejected", async () => {
    const { shares, A, credentials, w } = setup();
    const mpc = [shares.phone, shares.swissquote];
    const call = execute(w);
    const proof = prove(call, { mpc, passkey: A });
    const elsewhere = deploy(CHAIN + 1, RP, credentials);
    await rejects(submit(elsewhere, { ...call, wallet: elsewhere.address, chainId: elsewhere.chainId }, proof, T0), "UNAUTHORIZED");
    const spent = await submit(w, execute(w, { to: `0x${"22".repeat(20)}` }), prove(execute(w, { to: `0x${"22".repeat(20)}` }), { mpc, passkey: A }), T0);
    await rejects(submit(spent, { ...call, nonce: 1 }, proof, T0), "UNAUTHORIZED");
  });

  test("replaying an executed call fails on the nonce", async () => {
    const { shares, A, w } = setup();
    const call = execute(w);
    const proof = prove(call, { mpc: [shares.phone, shares.swissquote], passkey: A });
    const next = await submit(w, call, proof, T0);
    await rejects(submit(next, call, proof, T0), "BAD_NONCE");
  });
});

describe("state checks", () => {
  const signed = () => {
    const { shares, A, w } = setup();
    const call = execute(w);
    return { w, call, proof: prove(call, { mpc: [shares.phone, shares.swissquote], passkey: A }) };
  };

  test("wrong wallet", async () => {
    const { w, call, proof } = signed();
    await rejects(submit(w, { ...call, wallet: `0x${"00".repeat(20)}` }, proof, T0), "WRONG_WALLET");
  });

  test("wrong chain", async () => {
    const { w, call, proof } = signed();
    await rejects(submit(w, { ...call, chainId: 1 }, proof, T0), "WRONG_CHAIN");
  });

  test("stale version", async () => {
    const { w, call, proof } = signed();
    await rejects(submit(w, { ...call, version: 0 }, proof, T0), "STALE_VERSION");
  });

  test("before validAfter", async () => {
    const { w, call, proof } = signed();
    await rejects(submit(w, call, proof, call.validAfter - 1), "OUTSIDE_VALIDITY");
  });

  test("after validUntil", async () => {
    const { w, call, proof } = signed();
    await rejects(submit(w, call, proof, call.validUntil + 1), "OUTSIDE_VALIDITY");
  });
});

describe("webauthn", () => {
  const attempt = (assertion, passkey) => {
    const t = setup();
    const call = execute(t.w);
    return submit(t.w, call, prove(call, { mpc: [t.shares.phone, t.shares.swissquote], passkey: passkey ?? t.A, assertion }), T0);
  };

  test("wrong origin is rejected", () => rejects(attempt({ origin: "https://evil.example" }), "UNAUTHORIZED"));
  test("wrong RP id is rejected", () => rejects(attempt({ rpId: "evil.example" }), "UNAUTHORIZED"));
  test("UV off is rejected", () => rejects(attempt({ uv: false }), "UNAUTHORIZED"));
  test("an unregistered credential is rejected", () => rejects(attempt(undefined, authenticator()), "UNAUTHORIZED"));
});

describe("recovery", () => {
  test("S+B+R registers a pending request at the server's now", async () => {
    const { request, w } = await pendingRecovery(T0 + 5);
    assert.equal(w.pending.registeredAt, T0 + 5);
    assert.equal(w.pending.id, request.id);
    assert.deepEqual(w.requests, [request.id]);
  });

  test("spending is suspended while recovery is pending even with valid P+S+A", async () => {
    const { shares, A, w } = await pendingRecovery();
    const call = execute(w);
    await rejects(submit(w, call, prove(call, { mpc: [shares.phone, shares.swissquote], passkey: A }), T0 + 60), "SPENDING_SUSPENDED");
  });

  test("finalize one second before 48 hours fails", async () => {
    const { request, w } = await pendingRecovery();
    await rejects(submit(w, finalize(w, request.id), {}, T0 + RECOVERY_DELAY - 1), "DELAY_NOT_ELAPSED");
  });

  test("at 48 hours anyone finalizes with no proof and only the new credentials can spend", async () => {
    const { shares, A, fresh, request, w } = await pendingRecovery();
    const next = await submit(w, finalize(w, request.id), {}, T0 + RECOVERY_DELAY);
    assert.equal(next.version, 2);
    assert.equal(next.address, w.address);
    assert.equal(next.nonce, w.nonce);
    assert.equal(next.pending, null);
    assert.deepEqual(next.credentials, fresh.credentials);
    const call = execute(next, { validUntil: T0 + RECOVERY_DELAY + 600 });
    const old = [shares.phone, shares.swissquote];
    const now = [fresh.shares.phone, fresh.shares.swissquote];
    await rejects(submit(next, call, prove(call, { mpc: old, passkey: A }), T0 + RECOVERY_DELAY), "UNAUTHORIZED");
    await rejects(submit(next, call, prove(call, { mpc: old, passkey: fresh.A }), T0 + RECOVERY_DELAY), "UNAUTHORIZED");
    await rejects(submit(next, call, prove(call, { mpc: now, passkey: A }), T0 + RECOVERY_DELAY), "UNAUTHORIZED");
    assert.equal((await submit(next, call, prove(call, { mpc: now, passkey: fresh.A }), T0 + RECOVERY_DELAY)).nonce, 1);
  });
});

describe("cancellation", () => {
  test("A cancels without MPC and spending resumes", async () => {
    const { shares, A, request, w } = await pendingRecovery();
    const call = cancel(w, request.id);
    const next = await submit(w, call, prove(call, { passkey: A }), T0 + 60);
    assert.equal(next.pending, null);
    const spend = execute(next);
    assert.equal((await submit(next, spend, prove(spend, { mpc: [shares.phone, shares.swissquote], passkey: A }), T0 + 60)).nonce, 1);
  });

  test("R cancels", async () => {
    const { R, request, w } = await pendingRecovery();
    const call = cancel(w, request.id);
    assert.equal((await submit(w, call, prove(call, { recovery: R }), T0 + 60)).pending, null);
  });

  test("finalize after cancel fails", async () => {
    const { A, request, w } = await pendingRecovery();
    const call = cancel(w, request.id);
    const next = await submit(w, call, prove(call, { passkey: A }), T0 + 60);
    await rejects(submit(next, finalize(next, request.id), {}, T0 + RECOVERY_DELAY), "NO_SUCH_REQUEST");
  });

  test("re-submitting the cancelled request's original signed call fails with REQUEST_REUSED", async () => {
    const { shares, A, R, request, w } = await pendingRecovery();
    const call = cancel(w, request.id);
    const next = await submit(w, call, prove(call, { passkey: A }), T0 + 60);
    const proof = prove(request, { mpc: [shares.swissquote, shares.backup], recovery: R });
    await rejects(submit(next, request, proof, T0 + 120), "REQUEST_REUSED");
  });

  test("a cancel signed for a different request id is rejected", async () => {
    const { A, w } = await pendingRecovery();
    const other = cancel(w, "req-other");
    const proof = prove(other, { passkey: A });
    await rejects(submit(w, other, proof, T0 + 60), "NO_SUCH_REQUEST");
    await rejects(submit(w, { ...other, id: w.pending.id }, proof, T0 + 60), "UNAUTHORIZED");
  });
});

describe("pending requests", () => {
  test("only one change pending at a time", async () => {
    const { shares, A, R, fresh, w } = await pendingRecovery();
    const quorum = [shares.swissquote, shares.backup];
    const recover = change("recover", w, fresh.credentials, { id: "req-2" });
    await rejects(submit(w, recover, prove(recover, { mpc: quorum, recovery: R }), T0 + 60), "CHANGE_PENDING");
    const maintain = change("maintain", w, fresh.credentials, { id: "req-3" });
    await rejects(submit(w, maintain, prove(maintain, { mpc: quorum, passkey: A }), T0 + 60), "CHANGE_PENDING");
  });

  test("a request whose expiry is not beyond the delay is refused", async () => {
    const { shares, R, w } = setup();
    const quorum = [shares.swissquote, shares.backup];
    const tooSoon = change("recover", w, setup().credentials, { expiresAt: T0 + RECOVERY_DELAY });
    await rejects(submit(w, tooSoon, prove(tooSoon, { mpc: quorum, recovery: R }), T0), "EXPIRY_TOO_SOON");
    const justEnough = { ...tooSoon, expiresAt: T0 + RECOVERY_DELAY + 1 };
    assert.ok((await submit(w, justEnough, prove(justEnough, { mpc: quorum, recovery: R }), T0)).pending);
  });

  test("an expired request stops suspending spending, cannot be finalized, and does not block a new request", async () => {
    const { shares, A, R, fresh, request, w } = await pendingRecovery();
    const later = request.expiresAt + 1;
    const spend = execute(w, { validUntil: later + 60 });
    assert.equal((await submit(w, spend, prove(spend, { mpc: [shares.phone, shares.swissquote], passkey: A }), later)).nonce, 1);
    await rejects(submit(w, finalize(w, request.id), {}, later), "REQUEST_EXPIRED");
    const again = change("recover", w, fresh.credentials, { id: "req-2", expiresAt: later + 3 * RECOVERY_DELAY });
    const next = await submit(w, again, prove(again, { mpc: [shares.swissquote, shares.backup], recovery: R }), later);
    assert.equal(next.pending.id, "req-2");
  });
});

describe("maintenance", () => {
  async function scheduled() {
    const t = setup();
    const newR = createRecoveryKey();
    const request = change("maintain", t.w, { ...t.credentials, recoveryKey: newR.publicKey });
    const w = await submit(t.w, request, prove(request, { mpc: [t.shares.phone, t.shares.swissquote], passkey: t.A }), T0);
    return { ...t, newR, request, w };
  }

  test("A plus MPC schedules replacing R and spending is not suspended", async () => {
    const { shares, A, request, w } = await scheduled();
    assert.equal(w.pending.id, request.id);
    const spend = execute(w);
    assert.equal((await submit(w, spend, prove(spend, { mpc: [shares.phone, shares.swissquote], passkey: A }), T0 + 60)).nonce, 1);
  });

  test("maintenance finalizes after the delay", async () => {
    const { newR, request, w } = await scheduled();
    const next = await submit(w, finalize(w, request.id), {}, T0 + RECOVERY_DELAY);
    assert.equal(next.credentials.recoveryKey, newR.publicKey);
    assert.equal(next.version, 2);
  });

  test("R can cancel maintenance", async () => {
    const { R, request, w } = await scheduled();
    const call = cancel(w, request.id);
    assert.equal((await submit(w, call, prove(call, { recovery: R }), T0 + 60)).pending, null);
  });

  test("R in place of A cannot schedule maintenance", async () => {
    const { shares, R, credentials, w } = setup();
    const request = change("maintain", w, { ...credentials, recoveryKey: createRecoveryKey().publicKey });
    await rejects(submit(w, request, prove(request, { mpc: [shares.phone, shares.swissquote], recovery: R }), T0), "UNAUTHORIZED");
  });
});

describe("stolen R", () => {
  test("a cooperating quorum starts recovery, the user cancels with A inside the window, and the attacker's finalize fails", async () => {
    const { shares, A, R, w } = setup();
    const attacker = setup();
    const request = change("recover", w, attacker.credentials, { id: "req-attack" });
    const started = await submit(w, request, prove(request, { mpc: [shares.swissquote, shares.backup], recovery: R }), T0);
    assert.equal(started.pending.id, "req-attack");
    const call = cancel(started, request.id);
    const saved = await submit(started, call, prove(call, { passkey: A }), T0 + 36 * 60 * 60);
    await rejects(submit(saved, finalize(saved, request.id), {}, T0 + RECOVERY_DELAY), "NO_SUCH_REQUEST");
    assert.deepEqual(saved.credentials, w.credentials);
  });
});

describe("structure", () => {
  test("every Call type has a RULES entry", () => {
    assert.deepEqual(Object.keys(RULES).sort(), ["cancel", "execute", "finalize", "maintain", "recover"]);
  });

  test("every alternative for execute, maintain and recover contains a user factor", () => {
    for (const type of ["execute", "maintain", "recover"]) {
      assert.ok(RULES[type].length > 0, `${type} has at least one path`);
      for (const alternative of RULES[type]) assert.ok(alternative.some((f) => f !== "mpc"), `${type}: ${alternative} needs a user factor`);
    }
  });
});

const SECRET = "fuse-wallet-check-secret-0123456789abcdef";

async function server() {
  const events = [];
  const auth = betterAuth({
    baseURL: RP.origin,
    secret: SECRET,
    database: new DatabaseSync(":memory:"),
    emailAndPassword: { enabled: true },
    plugins: [passkey({ rpName: "Fuse" }), wallet({ onChangeRequested: (event) => void events.push(event) })],
  });
  await (await getMigrations(auth.options)).runMigrations();
  const ctx = await auth.$context;
  let users = 0;
  async function user() {
    const { headers, response } = await auth.api.signUpEmail({
      body: { email: `u${++users}@fuse.test`, password: "correct horse battery staple", name: "Fuse" },
      returnHeaders: true,
    });
    const cookie = headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
    const A = authenticator();
    await ctx.adapter.create({
      model: "passkey",
      data: {
        name: "check",
        userId: response.user.id,
        credentialID: A.passkey.credentialId,
        publicKey: A.passkey.publicKey,
        counter: 0,
        deviceType: "singleDevice",
        backedUp: false,
        transports: "internal",
        createdAt: new Date(),
      },
    });
    return { id: response.user.id, headers: new Headers({ cookie }), A };
  }
  const transport = (headers) => ({
    keygen: (round1) => auth.api.walletKeygen({ body: { round1 }, headers }),
    finish: (token, round2) => auth.api.walletKeygenFinish({ body: { token, round2 }, headers }),
  });
  async function onboard() {
    const u = await user();
    const P = await phoneKeygen(transport(u.headers));
    const R = createRecoveryKey();
    const body = { mpcKey: groupKey(P), credentialId: u.A.passkey.credentialId, recoveryKey: R.publicKey };
    return { ...u, P, R, w: await auth.api.walletCreate({ body, headers: u.headers }) };
  }
  async function authorize(me, call, signer) {
    const message = digest(call);
    const passkey = me.A.assert(message);
    const mpc = await cosignWith(me.P, message, async (commitments) =>
      unpack(await auth.api.walletCosign({ body: { signer, call, proof: { passkey }, commitments: pack(commitments) } })),
    );
    return { mpc, passkey };
  }
  async function replacement(me) {
    const device = await user();
    return {
      mpcKey: groupKey(await phoneKeygen(transport(device.headers))),
      passkey: device.A.passkey,
      recoveryKey: me.R.publicKey,
    };
  }
  return { auth, ctx, events, user, transport, onboard, authorize, replacement };
}

const apiRejects = (promise, code) =>
  assert.rejects(promise, (e) => {
    assert.equal(typeof code === "number" ? e.statusCode : e.body?.code, code, e.message);
    return true;
  });
const live = () => {
  const now = Math.floor(Date.now() / 1000);
  return { now, validAfter: now - 60, validUntil: now + 600 };
};

describe("plugin", () => {
  test("keygen then finish stores one share per provider, encrypted at rest, and both sides agree on the group key", async () => {
    const s = await server();
    const u = await s.user();
    await apiRejects(s.transport(new Headers()).keygen(pack(F.DKG.round1(ID.phone, SIGNERS).public)), 401);
    const spoofed = pack({ ...F.DKG.round1(ID.swissquote, SIGNERS).public });
    await apiRejects(s.transport(u.headers).keygen(spoofed), "WRONG_PARTICIPANT");
    const seen = {};
    const P = await phoneKeygen({
      ...s.transport(u.headers),
      finish: (token, round2) => {
        Object.assign(seen, { token, round2 });
        return s.transport(u.headers).finish(token, round2);
      },
    });
    await apiRejects(s.transport(u.headers).finish(seen.token, seen.round2), "KEYGEN_EXPIRED");
    const rows = await s.ctx.adapter.findMany({ model: "walletShare", where: [{ field: "groupKey", value: groupKey(P) }] });
    assert.deepEqual(rows.map((r) => r.holder).sort(), ["backup", "swissquote"]);
    for (const row of rows) {
      const key = unpack(JSON.parse(await symmetricDecrypt({ key: SECRET, data: row.share })));
      assert.equal(groupKey(key), groupKey(P), `${row.holder} agrees on the group key`);
      assert.ok(!row.share.includes(bytesToHex(key.secret.signingShare)), `${row.holder}'s share is not stored in the clear`);
    }
  });

  test("create requires a session, refuses a passkey owned by another user and an unknown MPC key, and is idempotent", async () => {
    const s = await server();
    const u = await s.user();
    const other = await s.user();
    const P = await phoneKeygen(s.transport(u.headers));
    const body = { mpcKey: groupKey(P), credentialId: u.A.passkey.credentialId, recoveryKey: createRecoveryKey().publicKey };
    await apiRejects(s.auth.api.walletCreate({ body }), 401);
    await apiRejects(s.auth.api.walletCreate({ body: { ...body, credentialId: other.A.passkey.credentialId }, headers: u.headers }), "PASSKEY_NOT_YOURS");
    await apiRejects(s.auth.api.walletCreate({ body: { ...body, mpcKey: `0x02${"ab".repeat(32)}` }, headers: u.headers }), "UNKNOWN_MPC_KEY");
    const theirs = { ...body, credentialId: other.A.passkey.credentialId };
    await apiRejects(s.auth.api.walletCreate({ body: theirs, headers: other.headers }), "UNKNOWN_MPC_KEY");
    await apiRejects(s.auth.api.walletCreate({ body: { ...body, recoveryKey: `0x${"ab".repeat(31)}` }, headers: u.headers }), 400);
    const w = await s.auth.api.walletCreate({ body, headers: u.headers });
    assert.equal(w.version, 1);
    assert.deepEqual(await s.auth.api.walletCreate({ body, headers: u.headers }), w);
    assert.deepEqual(await s.auth.api.walletState({ query: { address: w.address } }), w);
    await apiRejects(s.auth.api.walletState({ query: { address: `0x${"00".repeat(20)}` } }), "NO_SUCH_WALLET");
  });

  test("P+S via /wallet/cosign then /wallet/submit executes, and so does P+B with signer backup", async () => {
    const s = await server();
    const me = await s.onboard();
    const { validAfter, validUntil } = live();
    const first = execute(me.w, { validAfter, validUntil });
    const next = await s.auth.api.walletSubmit({ body: { call: first, proof: await s.authorize(me, first, "swissquote") } });
    assert.equal(next.nonce, 1);
    const second = execute(next, { validAfter, validUntil });
    assert.equal((await s.auth.api.walletSubmit({ body: { call: second, proof: await s.authorize(me, second, "backup") } })).nonce, 2);
  });

  test("S+B+A via /wallet/provider-sign then /wallet/submit executes when the phone is lost", async () => {
    const s = await server();
    const me = await s.onboard();
    const { validAfter, validUntil } = live();
    const call = execute(me.w, { validAfter, validUntil });
    const passkey = me.A.assert(digest(call));
    const { mpc } = await s.auth.api.walletProviderSign({ body: { call, proof: { passkey } } });
    assert.equal((await s.auth.api.walletSubmit({ body: { call, proof: { mpc, passkey } } })).nonce, 1);
  });

  test("cosign and provider-sign refuse without a valid user factor and refuse cancel and finalize calls", async () => {
    const s = await server();
    const me = await s.onboard();
    const { validAfter, validUntil } = live();
    const call = execute(me.w, { validAfter, validUntil });
    const commitments = pack(F.commit(me.P.secret).commitments);
    const stranger = authenticator().assert(digest(call));
    await apiRejects(s.auth.api.walletCosign({ body: { signer: "swissquote", call, proof: {}, commitments } }), "UNAUTHORIZED");
    await apiRejects(s.auth.api.walletCosign({ body: { signer: "backup", call, proof: { passkey: stranger }, commitments } }), "UNAUTHORIZED");
    await apiRejects(s.auth.api.walletProviderSign({ body: { call, proof: {} } }), "UNAUTHORIZED");
    await apiRejects(s.auth.api.walletProviderSign({ body: { call, proof: { recovery: signWithRecoveryKey(digest(call), me.R.secret) } } }), "UNAUTHORIZED");
    for (const noMpc of [cancel(me.w, "req-1"), finalize(me.w, "req-1")]) {
      const proof = { passkey: me.A.assert(digest(noMpc)) };
      await apiRejects(s.auth.api.walletCosign({ body: { signer: "swissquote", call: noMpc, proof, commitments } }), "NO_MPC_NEEDED");
      await apiRejects(s.auth.api.walletProviderSign({ body: { call: noMpc, proof } }), "NO_MPC_NEEDED");
    }
  });

  test("provider-sign with R then submit registers recovery and fires onChangeRequested once", async () => {
    const s = await server();
    const me = await s.onboard();
    const { now } = live();
    const request = change("recover", me.w, await s.replacement(me), { expiresAt: now + 3 * RECOVERY_DELAY });
    const recovery = signWithRecoveryKey(digest(request), me.R.secret);
    const { mpc } = await s.auth.api.walletProviderSign({ body: { call: request, proof: { recovery } } });
    const next = await s.auth.api.walletSubmit({ body: { call: request, proof: { mpc, recovery } } });
    assert.equal(next.pending.id, request.id);
    assert.ok(next.pending.registeredAt >= now);
    assert.equal(s.events.length, 1);
    assert.equal(s.events[0].request.id, request.id);
    assert.equal(s.events[0].wallet.address, me.w.address);
  });

  test("providers refuse a change whose replacement key shares or passkey they cannot find", async () => {
    const s = await server();
    const me = await s.onboard();
    const { now } = live();
    const real = await s.replacement(me);
    const unverifiable = [
      [{ ...real, mpcKey: `0x02${"ab".repeat(32)}` }, "UNKNOWN_MPC_KEY"],
      [{ ...real, passkey: authenticator().passkey }, "UNKNOWN_PASSKEY"],
      [{ ...real, passkey: { ...real.passkey, publicKey: authenticator().passkey.publicKey } }, "UNKNOWN_PASSKEY"],
    ];
    for (const [replacement, code] of unverifiable) {
      const request = change("recover", me.w, replacement, { expiresAt: now + 3 * RECOVERY_DELAY });
      const recovery = signWithRecoveryKey(digest(request), me.R.secret);
      await apiRejects(s.auth.api.walletProviderSign({ body: { call: request, proof: { recovery } } }), code);
    }
    const maintain = change("maintain", me.w, { ...real, passkey: authenticator().passkey }, { expiresAt: now + 3 * RECOVERY_DELAY });
    const commitments = pack(F.commit(me.P.secret).commitments);
    const proof = { passkey: me.A.assert(digest(maintain)) };
    await apiRejects(s.auth.api.walletCosign({ body: { signer: "swissquote", call: maintain, proof, commitments } }), "UNKNOWN_PASSKEY");
  });

  test("a cancel submitted with no session or cookies is accepted", async () => {
    const s = await server();
    const me = await s.onboard();
    const { now } = live();
    const request = change("recover", me.w, await s.replacement(me), { expiresAt: now + 3 * RECOVERY_DELAY });
    const recovery = signWithRecoveryKey(digest(request), me.R.secret);
    const { mpc } = await s.auth.api.walletProviderSign({ body: { call: request, proof: { recovery } } });
    const pending = await s.auth.api.walletSubmit({ body: { call: request, proof: { mpc, recovery } } });
    const call = cancel(pending, request.id);
    const proof = { passkey: me.A.assert(digest(call)) };
    const response = await s.auth.handler(
      new Request(`${RP.origin}/api/auth/wallet/submit`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ call, proof }),
      }),
    );
    const body = await response.json();
    assert.equal(response.status, 200, JSON.stringify(body));
    assert.equal(body.pending, null);
    assert.equal((await s.auth.api.walletState({ query: { address: me.w.address } })).pending, null);
  });

  test("two concurrent submits of the same execute call: exactly one succeeds", async () => {
    const s = await server();
    const me = await s.onboard();
    const { validAfter, validUntil } = live();
    const call = execute(me.w, { validAfter, validUntil });
    const proof = await s.authorize(me, call, "swissquote");
    const results = await Promise.allSettled([1, 2].map(() => s.auth.api.walletSubmit({ body: { call, proof } })));
    assert.deepEqual(results.map((r) => r.status).sort(), ["fulfilled", "rejected"]);
    assert.equal(results.find((r) => r.status === "rejected").reason.body.code, "CONFLICT", "the loser lost the compare-and-swap, not the nonce check");
    assert.equal((await s.auth.api.walletState({ query: { address: me.w.address } })).nonce, 1);
  });
});
