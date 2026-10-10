import { encodeFunctionData, erc20Abi } from "viem";
import { parseRequest } from "../lib/compliance/schema";
import { DEMO } from "../services/compliance/demo";
import { TrmScreeningProvider } from "../services/compliance/trm";
import { ViemSimulationProvider } from "../services/compliance/viem-simulation";

/** Explicit opt-in network diagnostics, separate from deterministic tests. Never broadcasts. */
async function main() {
  const request = parseRequest({ requestId: "readonly-provider-check", chainId: DEMO.chainId,
    account: DEMO.account, nonce: "0", calls: [{ to: DEMO.usdc,
      data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [DEMO.vault, 0n] }),
    }] });
  console.log("Live read-only diagnostics: uses TRM quota and Base Sepolia RPC; does not sign or broadcast.");
  const [screening, simulation] = await Promise.all([
    new TrmScreeningProvider({ apiKey: process.env.TRM_API_KEY }).screen([DEMO.sanctioned], DEMO.chainId),
    new ViemSimulationProvider({ [DEMO.chainId]: process.env.COMPLIANCE_CHECK_RPC_URL ?? "https://sepolia.base.org" }).simulate(request),
  ]);
  console.log(JSON.stringify({ screening, simulation }, null, 2));
  if (screening[0]?.status !== "MATCH") throw new Error("The demonstration sanctions-match check did not return MATCH; investigate current evidence/provider availability.");
  if (simulation.status !== "SUCCESS" || !simulation.approvalChanges.some((item) => item.owner === DEMO.account && item.token === DEMO.usdc && item.spender === DEMO.vault && item.amount === "0")) {
    throw new Error("RPC simulation did not confirm the zero-allowance approval event.");
  }
  console.log("Both live adapter checks passed. This is not a transaction broadcast or a compliance certificate.");
}
main().catch((error) => { console.error(error.message); process.exitCode = 1 });
