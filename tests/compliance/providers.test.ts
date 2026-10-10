import assert from "node:assert/strict";
import { test } from "node:test";
import { encodeAbiParameters, encodeEventTopics, erc20Abi as fullErc20Abi, type PublicClient } from "viem";
import { DEMO, demoRequest } from "../../services/compliance/demo";
import { TrmScreeningProvider } from "../../services/compliance/trm";
import { ViemSimulationProvider } from "../../services/compliance/viem-simulation";
import { NOW } from "./helpers";

test("TRM adapter uses the documented batch body and optional key:key Basic auth", async () => {
  const provider = new TrmScreeningProvider({ apiKey: "test-secret", intervalMs: 0, now: () => NOW,
    fetch: (async (url, options) => {
      assert.equal(url, "https://api.trmlabs.com/public/v1/sanctions/screening");
      assert.deepEqual(JSON.parse(options!.body as string), [{ address: DEMO.account }, { address: DEMO.sanctioned }]);
      assert.equal(new Headers(options!.headers).get("Authorization"), `Basic ${Buffer.from("test-secret:test-secret").toString("base64")}`);
      return Response.json([{ address: DEMO.account, isSanctioned: false }, { address: DEMO.sanctioned, isSanctioned: true }], { status: 201 });
    }) as typeof fetch });
  assert.deepEqual((await provider.screen([DEMO.account, DEMO.sanctioned], DEMO.chainId)).map((item) => item.status), ["CLEAR", "MATCH"]);
});
test("TRM public-tier requests omit Authorization when no key is configured", async () => {
  const provider = new TrmScreeningProvider({ intervalMs: 0, fetch: (async (_, options) => {
    assert.equal(new Headers(options!.headers).has("Authorization"), false);
    return Response.json([{ address: DEMO.account, isSanctioned: false }]);
  }) as typeof fetch });
  assert.equal((await provider.screen([DEMO.account], DEMO.chainId))[0].status, "CLEAR");
});
test("TRM rate limits, HTTP errors, malformed data and duplicate evidence are unavailable", async () => {
  for (const response of [new Response("rate limit", { status: 429 }), new Response("unauthorized", { status: 401 }),
    Response.json([{ address: DEMO.account, isSanctioned: "false" }]),
    Response.json([{ address: DEMO.account, isSanctioned: false }, { address: DEMO.account, isSanctioned: true }]),
  ]) {
    const provider = new TrmScreeningProvider({ intervalMs: 0, fetch: (async () => response) as typeof fetch });
    assert.equal((await provider.screen([DEMO.account], DEMO.chainId))[0].status, "UNAVAILABLE");
  }
});
test("missing TRM results never silently clear addresses", async () => {
  const provider = new TrmScreeningProvider({ intervalMs: 0, fetch: (async () => Response.json([{ address: DEMO.account, isSanctioned: false }])) as typeof fetch });
  assert.deepEqual((await provider.screen([DEMO.account, DEMO.recipient], DEMO.chainId)).map((item) => item.status), ["CLEAR", "UNAVAILABLE"]);
});
test("Viem adapter preserves account and batch order and decodes transfer counterparties", async () => {
  const request = demoRequest("transfer");
  const client = {
    async getChainId() { return DEMO.chainId },
    async simulateCalls(parameters: { account: string; calls: unknown[]; traceAssetChanges: boolean }) {
      assert.equal(parameters.account, DEMO.account);
      assert.equal(parameters.traceAssetChanges, true);
      assert.deepEqual(parameters.calls, request.calls.map((call) => ({ to: call.to, data: call.data, value: BigInt(call.value) })));
      return { block: { number: 123n }, assetChanges: [{ token: { address: DEMO.usdc, symbol: "USDC", decimals: 6 }, value: { diff: -20_000_000n } }],
        results: [{ status: "success", logs: [{ address: DEMO.usdc,
          topics: encodeEventTopics({ abi: fullErc20Abi, eventName: "Transfer", args: { from: DEMO.account, to: DEMO.recipient } }),
          data: encodeAbiParameters([{ type: "uint256" }], [20_000_000n]) }] }] };
    },
  } as unknown as Pick<PublicClient, "getChainId" | "simulateCalls">;
  const provider = new ViemSimulationProvider({ [DEMO.chainId]: "https://rpc.example" }, () => NOW, () => client);
  const result = await provider.simulate(request);
  assert.equal(result.status, "SUCCESS");
  assert.equal(result.blockNumber, "123");
  assert.deepEqual(result.assetChanges[0], { asset: DEMO.usdc, amount: "-20000000", symbol: "USDC", decimals: 6 });
  assert.ok(result.touchedAddresses.includes(DEMO.recipient));
  assert.equal(result.transfers[0].to, DEMO.recipient);
});
test("Viem adapter rejects a wrong chain and an unsupported RPC without fallback approval", async () => {
  const request = demoRequest("transfer");
  for (const chainId of [1, DEMO.chainId]) {
    const client = { async getChainId() { return chainId }, async simulateCalls() { throw new Error("method unsupported") } } as unknown as Pick<PublicClient, "getChainId" | "simulateCalls">;
    assert.equal((await new ViemSimulationProvider({ [DEMO.chainId]: "https://rpc.example" }, () => NOW, () => client).simulate(request)).status, "UNAVAILABLE");
  }
});
