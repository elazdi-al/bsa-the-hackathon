// The independent third-party service: holds Share C of every wallet key. It stores C only for
// a key Swissquote ticketed, learns its recovery key only from the wallet key itself, and
// releases C only to start a recovery that Swissquote approved AND that recovery key signed.
// It never takes part in a normal transaction.
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { decodeFunctionData, isAddressEqual, recoverAddress, recoverMessageAddress, type Address } from "viem";
import { formatUserOperation, getUserOperationHash, type UserOperation } from "viem/account-abstraction";
import * as z from "zod";
import { accountAbi, bindRecoveryKeyMessage, factoryAbi, type Config } from "../../lib/wallet/account.ts";
import { addresses, chain, credentials, publicClient } from "../../lib/wallet/env.ts";
import { address, recoveryApproval, share, sharesTicket, signature, userOp as userOpSchema } from "../../lib/wallet/schema.ts";
import { HOLDERS, signerOf, verifyShare } from "../../lib/wallet/shamir.ts";
import { verifyTicket } from "../../lib/wallet/tickets.ts";
import { openVault } from "../../lib/wallet/vault.ts";

const vault = openVault(process.env.PARTNER_DB ?? "data/partner.db", process.env.PARTNER_SHARE_KEY);
const PORT = Number(process.env.PARTNER_PORT ?? (new URL(process.env.PARTNER_URL ?? "http://localhost:4002").port || 4002));
const MAX_BODY = 64 * 1024;

class Refusal extends Error {}

async function store(body: unknown) {
  const input = z.object({ ticket: sharesTicket, share: share(HOLDERS.partner) }).parse(body);
  const ticket = await verifyTicket(addresses.swissquote, chain.id, "Shares", input.ticket);
  const commitments = [ticket.keyCommitment, ticket.slopeCommitment] as const;
  if (!verifyShare(input.share, commitments) || !isAddressEqual(signerOf(commitments), ticket.signer)) {
    throw new Refusal("This is not Share C of the ticketed key.");
  }
  if (!vault.get(ticket.signer)) vault.put({ signer: ticket.signer, passkey: { x: ticket.passkeyX, y: ticket.passkeyY }, share: input.share });
  console.log(`stored Share C of ${ticket.signer}`);
  return { signer: ticket.signer };
}

async function bind(signer: Address, body: unknown) {
  const input = z.object({ recoveryKey: address, signature }).parse(body);
  const by = await recoverMessageAddress({ message: bindRecoveryKeyMessage(signer, input.recoveryKey), signature: input.signature });
  if (!isAddressEqual(by, signer)) throw new Refusal("The wallet key did not sign this recovery key.");
  if (!vault.bind(signer, input.recoveryKey)) throw new Refusal("No Share C for that key, or it has another recovery key.");
  return { signer, recoveryKey: input.recoveryKey };
}

/** The account's config, read from the UserOperation that deploys it, checked against its address. */
async function initialConfig(op: UserOperation<"0.7">): Promise<Config> {
  if (!op.factoryData) throw new Refusal("The wallet is not deployed and the operation does not deploy it.");
  const { args } = decodeFunctionData({ abi: factoryAbi, data: op.factoryData });
  const [config, salt] = args as [Config, bigint];
  const predicted = await publicClient.readContract({ address: addresses.factory, abi: factoryAbi, functionName: "getAddress", args: [config, salt] });
  if (!isAddressEqual(predicted, op.sender)) throw new Refusal("The deployment config does not match the wallet.");
  return config;
}

async function release(body: unknown) {
  const input = z.object({ approval: recoveryApproval, userOp: userOpSchema, signature }).parse(body);
  const op = formatUserOperation(input.userOp as never) as UserOperation<"0.7">;
  const hash = getUserOperationHash({ chainId: chain.id, entryPointAddress: addresses.entryPoint, entryPointVersion: "0.7", userOperation: op });
  const approval = await verifyTicket(addresses.swissquote, chain.id, "RecoveryApproval", input.approval);
  if (approval.userOpHash !== hash || !isAddressEqual(approval.wallet, op.sender)) throw new Refusal("The approval is for another operation.");
  if (decodeFunctionData({ abi: accountAbi, data: op.callData }).functionName !== "initiateRecovery") throw new Refusal("Share C only starts a recovery.");
  const { signer } = await credentials(op.sender, () => initialConfig(op));
  const stored = vault.get(signer);
  // The independent check: the recovery key the wallet key named, kept at home, signed this exact operation.
  if (!stored?.recoveryKey || !isAddressEqual(await recoverAddress({ hash, signature: input.signature }), stored.recoveryKey)) {
    throw new Refusal("The wallet's recovery key did not sign this operation.");
  }
  console.log(`released Share C of ${signer} for recovery ${hash.slice(0, 10)}`);
  return { share: stored.share };
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY) throw new Refusal("The body is too large.");
    chunks.push(chunk as Buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString() || "{}");
  } catch {
    throw new Refusal("The body is not JSON.");
  }
}

function send(res: ServerResponse, status: number, body: unknown) {
  // The phone posts Share C and the recovery-key binding here directly, so Swissquote never sees C.
  res.writeHead(status, {
    "content-type": "application/json",
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "content-type",
  });
  res.end(JSON.stringify(body));
}

createServer(async (req, res) => {
  if (req.method === "OPTIONS") return send(res, 204, null);
  const [, route, signer, sub] = req.url?.split("/") ?? [];
  try {
    if (req.method === "POST" && route === "shares" && !signer) return send(res, 200, await store(await readJson(req)));
    if (req.method === "POST" && route === "shares" && sub === "recovery-key") return send(res, 200, await bind(address.parse(signer), await readJson(req)));
    if (req.method === "GET" && route === "shares" && signer) {
      const stored = vault.get(address.parse(signer));
      return stored
        ? send(res, 200, { signer: stored.signer, passkey: stored.passkey, recoveryKey: stored.recoveryKey ?? null })
        : send(res, 404, { error: "No share for that key." });
    }
    if (req.method === "POST" && route === "recovery") return send(res, 200, await release(await readJson(req)));
    send(res, 404, { error: "Not found." });
  } catch (error) {
    const message = error instanceof Refusal ? error.message : error instanceof z.ZodError ? "Invalid request." : "Refused.";
    console.warn(`refused ${req.method} ${req.url}: ${(error as Error).message}`);
    send(res, 400, { error: message });
  }
}).listen(PORT, () => console.log(`holding Share C on :${PORT}`));
