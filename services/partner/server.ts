// The independent third-party service: holds Share C of every wallet key. It stores C only
// for a key Swissquote ticketed, and releases it only to start a recovery that Swissquote
// approved AND the client's recovery key signed. It never co-signs a normal transaction.
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { decodeFunctionData, isAddressEqual, recoverAddress, type Address } from "viem";
import { formatUserOperation, getUserOperationHash, type UserOperation } from "viem/account-abstraction";
import { accountAbi, factoryAbi, type Config } from "../../lib/wallet/account.ts";
import { addresses, chain, credentials, publicClient } from "../../lib/wallet/env.ts";
import { HOLDERS, signerOf, verifyShare, type Share } from "../../lib/wallet/shamir.ts";
import { verifyTicket, type Ticket } from "../../lib/wallet/tickets.ts";
import { openVault } from "../../lib/wallet/vault.ts";

const vault = openVault(process.env.PARTNER_DB ?? "data/partner.db", process.env.PARTNER_SHARE_KEY);
const PORT = Number(new URL(process.env.PARTNER_URL ?? "http://localhost:4002").port);

async function store(body: { ticket: Ticket<"Shares">; share: Share }) {
  const ticket = await verifyTicket(addresses.swissquote, chain.id, "Shares", body.ticket);
  const commitments = [ticket.keyCommitment, ticket.slopeCommitment] as const;
  if (body.share.x !== HOLDERS.partner || !verifyShare(body.share, commitments) || !isAddressEqual(signerOf(commitments), ticket.signer)) {
    throw new Error("This is not Share C of the ticketed key.");
  }
  const existing = vault.get(ticket.signer);
  if (existing) return { signer: existing.signer };
  vault.put({ signer: ticket.signer, passkey: { x: ticket.passkeyX, y: ticket.passkeyY }, share: body.share });
  console.log(`[partner] stored Share C of ${ticket.signer}`);
  return { signer: ticket.signer };
}

/** The account's config, read from the UserOperation that deploys it, checked against its address. */
async function initialConfig(userOp: UserOperation<"0.7">): Promise<Config> {
  if (!userOp.factoryData) throw new Error("The wallet is not deployed and the operation does not deploy it.");
  const { args } = decodeFunctionData({ abi: factoryAbi, data: userOp.factoryData });
  const [config, salt] = args as [Config, bigint];
  const predicted = await publicClient.readContract({ address: addresses.factory, abi: factoryAbi, functionName: "getAddress", args: [config, salt] });
  if (!isAddressEqual(predicted, userOp.sender)) throw new Error("The deployment config does not match the wallet.");
  return config;
}

async function release(body: { approval: Ticket<"RecoveryApproval">; userOp: Record<string, unknown>; signature: `0x${string}` }) {
  const userOp = formatUserOperation(body.userOp as never) as UserOperation<"0.7">;
  const hash = getUserOperationHash({ chainId: chain.id, entryPointAddress: addresses.entryPoint, entryPointVersion: "0.7", userOperation: userOp });
  const approval = await verifyTicket(addresses.swissquote, chain.id, "RecoveryApproval", body.approval);
  if (approval.userOpHash !== hash || !isAddressEqual(approval.wallet, userOp.sender)) throw new Error("The approval is for another operation.");
  if (decodeFunctionData({ abi: accountAbi, data: userOp.callData }).functionName !== "initiateRecovery") {
    throw new Error("Share C only starts a recovery.");
  }
  const wallet = await credentials(userOp.sender, () => initialConfig(userOp));
  // The independent check: the client's recovery key, kept at home, signed this exact operation.
  if (!isAddressEqual(await recoverAddress({ hash, signature: body.signature }), wallet.recoveryKey)) {
    throw new Error("The recovery key did not sign this operation.");
  }
  const stored = vault.get(wallet.signer);
  if (!stored) throw new Error("No Share C for this wallet's key.");
  console.log(`[partner] released Share C of ${wallet.signer} for recovery ${hash.slice(0, 10)}`);
  return { share: stored.share };
}

async function readJson(req: IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return JSON.parse(Buffer.concat(chunks).toString() || "{}");
}

function send(res: ServerResponse, status: number, body: unknown) {
  // The phone posts Share C here directly, so Swissquote never sees it.
  res.writeHead(status, {
    "content-type": "application/json",
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "content-type",
  });
  res.end(JSON.stringify(body));
}

createServer(async (req, res) => {
  if (req.method === "OPTIONS") return send(res, 204, null);
  const [, route, signer] = req.url?.split("/") ?? [];
  try {
    if (req.method === "POST" && route === "shares") return send(res, 200, await store(await readJson(req)));
    if (req.method === "GET" && route === "shares" && signer) {
      const stored = vault.get(signer as Address);
      return stored ? send(res, 200, { signer: stored.signer, passkey: stored.passkey }) : send(res, 404, { error: "No share for that key." });
    }
    if (req.method === "POST" && route === "recovery") return send(res, 200, await release(await readJson(req)));
    send(res, 404, { error: "Not found." });
  } catch (error) {
    console.warn(`[partner] refused ${req.method} ${req.url}: ${(error as Error).message}`);
    send(res, 400, { error: (error as Error).message });
  }
}).listen(PORT, () => console.log(`[partner] holding Share C on :${PORT}`));
