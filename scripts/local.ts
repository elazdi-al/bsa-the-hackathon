// Runs the whole stack on a fresh local chain: anvil, the contracts, the partner service and the
// app. Writes .env.local for the app, the partner, `npm run e2e` and `npm run warp`.
//
//   npm run local            (PORT=3200 npm run local for another app port)
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { privateKeyToAddress } from "viem/accounts";

const RPC_URL = "http://127.0.0.1:8545";
const PORT = process.env.PORT ?? "3000";
// Anvil's first prefunded account plays Swissquote.
const SWISSQUOTE_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const MARKER = "# Written by npm run local.";
const POLICY_FILE = "data/compliance-policy.json";

if (existsSync(".env.local") && !readFileSync(".env.local", "utf8").startsWith(MARKER)) {
  console.error(".env.local was not written by npm run local. Move it aside first.");
  process.exit(1);
}

const children: ChildProcess[] = [];
const stop = () => {
  for (const child of children) child.kill();
  process.exit();
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);

function run(name: string, command: string, args: string[], env: Record<string, string> = {}) {
  const child = spawn(command, args, { env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] });
  const prefix = (chunk: Buffer) => chunk.toString().replace(/^(?=.)/gm, `[${name}] `);
  child.stdout.on("data", (chunk) => process.stdout.write(prefix(chunk)));
  child.stderr.on("data", (chunk) => process.stderr.write(prefix(chunk)));
  child.on("exit", (code) => {
    console.log(`[${name}] exited with ${code}`);
    stop();
  });
  children.push(child);
}

const rpcUp = () =>
  fetch(RPC_URL, { method: "POST", headers: { "content-type": "application/json" }, body: '{"jsonrpc":"2.0","id":1,"method":"eth_chainId"}' }).then(
    (res) => res.ok,
    () => false,
  );

if (await rpcUp()) {
  console.error(`Something already listens on ${RPC_URL}. Stop it first.`);
  process.exit(1);
}
run("anvil", "anvil", ["--silent", "--port", "8545"]);
while (!(await rpcUp())) await new Promise((r) => setTimeout(r, 200));

// The chain is new, so the share vaults from any previous run describe wallets that no longer exist.
rmSync("data", { recursive: true, force: true });
mkdirSync("data");

const deploy = spawnSync(
  "forge",
  ["script", "script/Deploy.s.sol", "--rpc-url", RPC_URL, "--private-key", SWISSQUOTE_KEY, "--broadcast"],
  { cwd: "contracts", encoding: "utf8", env: { ...process.env, SWISSQUOTE_ADDRESS: privateKeyToAddress(SWISSQUOTE_KEY), PAYMASTER_DEPOSIT: "10000000000000000000" } },
);
if (deploy.status !== 0) {
  console.error(deploy.stdout, deploy.stderr);
  stop();
}
const deployed = Object.fromEntries([...deploy.stdout.matchAll(/([A-Z_]+_ADDRESS)=(0x[0-9a-fA-F]{40})/g)].map((m) => [m[1], m[2]]));

// Swissquote sponsors USDC transfers on this chain; the compliance demo providers do the screening.
const usdc = deployed.USDC_ADDRESS.toLowerCase();
writeFileSync(
  POLICY_FILE,
  JSON.stringify({
    version: "local-1",
    decisionTtlSeconds: 120,
    screeningMaxAgeSeconds: 120,
    supportedChainIds: [31337],
    nativeTransfers: [],
    tokens: [
      { chainId: 31337, address: usdc, symbol: "USDC", decimals: 6, approvedSpenders: [], maxTransactionAmount: "10000000000", stepUpAmount: "1000000000", dailyLimitAmount: "5000000000" },
    ],
    contracts: [{ chainId: 31337, address: usdc, name: "USDC", kind: "ERC20", allowedFunctions: ["transfer"], origins: [] }],
  }),
);

const env = {
  RPC_URL,
  SWISSQUOTE_KEY,
  SWISSQUOTE_ADDRESS: privateKeyToAddress(SWISSQUOTE_KEY),
  ...deployed,
  SWISSQUOTE_SHARE_KEY: randomBytes(32).toString("hex"),
  PARTNER_SHARE_KEY: randomBytes(32).toString("hex"),
  PARTNER_URL: "http://localhost:4002",
  APP_URL: `http://localhost:${PORT}`,
  COMPLIANCE_MODE: "demo",
  COMPLIANCE_POLICY_FILE: POLICY_FILE,
};
writeFileSync(".env.local", `${MARKER}\n${Object.entries(env).map(([k, v]) => `${k}=${v}`).join("\n")}\n`);
console.log(`Contracts deployed, .env.local written.\n${Object.entries(deployed).map(([k, v]) => `  ${k}=${v}`).join("\n")}`);

run("partner", "node", ["services/partner/server.ts"], env);
run("app", "npx", ["next", "dev", "--port", PORT], env);
