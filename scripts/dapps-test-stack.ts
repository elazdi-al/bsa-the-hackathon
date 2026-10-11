// Starts an isolated local stack with fresh temporary databases, policy and Anvil state.
// Requires a production build, forge/anvil on PATH and a Playwright browser for --ui.
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { privateKeyToAddress } from "viem/accounts";
import { localDappPolicy } from "../services/dapps/local-policy";

const directory = mkdtempSync(join(tmpdir(), "swissquote-dapps-test-"));
const children: ChildProcess[] = [];
let stopping = false;
function stop() {
  if (stopping) return;
  stopping = true;
  for (const child of children.reverse()) {
    if (!child.pid || child.exitCode !== null) continue;
    if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(child.pid), "/t", "/f"], { stdio: "ignore" });
    else { try { process.kill(-child.pid); } catch {} }
  }
}
process.once("exit", stop);
process.once("SIGINT", () => process.exit(130));
process.once("SIGTERM", () => process.exit(143));
const freePort = () => new Promise<number>((resolve, reject) => {
  const server = createServer(); server.once("error", reject);
  server.listen(0, "127.0.0.1", () => { const port = (server.address() as { port: number }).port; server.close(() => resolve(port)); });
});
const [rpcPort, partnerPort, appPort] = await Promise.all([freePort(), freePort(), freePort()]);
const RPC_URL = `http://127.0.0.1:${rpcPort}`;
// WebAuthn RP IDs use a domain (localhost), not a raw IP address.
const APP_URL = `http://localhost:${appPort}`;
const PARTNER_URL = `http://127.0.0.1:${partnerPort}`;
// Public Anvil fixture key, never a real bank/client key.
const SWISSQUOTE_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
function start(name: string, command: string, args: string[], env: Record<string, string> = {}) {
  const child = spawn(command, args, { env: { ...process.env, ...env }, detached: true, stdio: ["ignore", "pipe", "pipe"] });
  const log = (chunk: Buffer) => { if (name !== "anvil" || process.env.VERBOSE_STACK) process.stdout.write(`[${name}] ${chunk}`); };
  child.stdout!.on("data", log); child.stderr!.on("data", log);
  child.on("error", (error) => { console.error(error); process.exitCode = 1; stop(); });
  child.on("exit", (code) => { if (!stopping) { console.error(`${name} exited (${code})`); process.exitCode = 1; stop(); } });
  children.push(child);
}
async function ready(url: string, rpc = false) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (stopping) throw new Error("A stack process failed.");
    try {
      const result = await fetch(url, { ...(rpc ? { method: "POST", headers: { "content-type": "application/json" }, body: '{"jsonrpc":"2.0","id":1,"method":"eth_chainId"}' } : {}), signal: AbortSignal.timeout(1000) });
      if (result.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Timed out waiting for ${url}`);
}
try {
  console.log(`Isolated test storage: ${directory}`);
  start("anvil", "anvil", ["--silent", "--host", "127.0.0.1", "--port", String(rpcPort)], { RUST_LOG: "error" });
  await ready(RPC_URL, true);
  const deployment = spawnSync("forge", ["script", "script/Deploy.s.sol", "--rpc-url", RPC_URL, "--private-key", SWISSQUOTE_KEY, "--broadcast"], {
    cwd: "contracts", encoding: "utf8", env: { ...process.env, SWISSQUOTE_ADDRESS: privateKeyToAddress(SWISSQUOTE_KEY), PAYMASTER_DEPOSIT: "10000000000000000000" },
  });
  if (deployment.status !== 0) throw new Error(`Deployment failed: ${deployment.stdout}\n${deployment.stderr}`);
  const deployed = Object.fromEntries([...deployment.stdout.matchAll(/([A-Z_]+_ADDRESS)=(0x[0-9a-fA-F]{40})/g)].map((match) => [match[1], match[2]]));
  if (!deployed.VAULT_ADDRESS) throw new Error("Deployment did not return a vault.");
  const policyFile = join(directory, "policy.json");
  writeFileSync(policyFile, JSON.stringify(localDappPolicy(deployed.USDC_ADDRESS, deployed.VAULT_ADDRESS)));
  const env = {
    CHAIN: "anvil", RPC_URL, APP_URL, PARTNER_URL, PARTNER_PORT: String(partnerPort), NEXT_PUBLIC_PARTNER_URL: PARTNER_URL,
    SWISSQUOTE_KEY, SWISSQUOTE_ADDRESS: privateKeyToAddress(SWISSQUOTE_KEY), ...deployed,
    SWISSQUOTE_DB: join(directory, "bank.db"), PARTNER_DB: join(directory, "partner.db"),
    SWISSQUOTE_SHARE_KEY: randomBytes(32).toString("hex"), PARTNER_SHARE_KEY: randomBytes(32).toString("hex"),
    COMPLIANCE_MODE: "demo", COMPLIANCE_POLICY_FILE: policyFile, COMPLIANCE_AUDIT_FILE: join(directory, "audit.ndjson"),
  };
  start("partner", process.execPath, ["services/partner/server.ts"], env);
  start("app", process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(appPort)], env);
  // A fresh partner has no shares to GET, but answers an OPTIONS request without mutation.
  for (let attempt = 0; ; attempt++) {
    const up = await fetch(`${PARTNER_URL}/shares`, { method: "OPTIONS", signal: AbortSignal.timeout(1000) }).then((response) => response.ok, () => false);
    if (up) break;
    if (attempt >= 100 || stopping) throw new Error("Partner did not start.");
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  await ready(`${APP_URL}/api/config`);
  // The static browser bundle pins the partner at build time. UI tests intercept that URL locally
  // and forward to this isolated partner, without changing the app's pinned production configuration.
  for (const script of ["scripts/e2e.ts", "scripts/dapps-e2e.ts", ...(process.argv.includes("--ui") ? ["scripts/dapps-ui-e2e.ts"] : [])]) {
    const test = spawn(process.execPath, ["--import", "tsx", script], { env: { ...process.env, ...env }, stdio: "inherit" });
    children.push(test);
    const code = await new Promise<number>((resolve, reject) => { test.once("error", reject); test.once("exit", (code) => resolve(code ?? 1)); });
    if (code !== 0) throw new Error(`${script} failed (${code}).`);
  }
  console.log("Isolated stack checks passed. Stopping test services; existing wallet data was not touched.");
} finally { stop(); }
