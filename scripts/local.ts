// Runs the whole stack on a fresh local chain: anvil, the contracts, the partner service and the
// app. Writes .env.local for the app, the partner, the CLI (npm run status, fund, ...) and npm run e2e.
//
//   npm run local            (PORT, RPC_PORT and PARTNER_PORT pick other ports)
//   npm run local -- --prod  a public demo behind a tunnel: a production build instead of next dev.
//                            PUBLIC_PARTNER_URL is the partner's public URL, where phones post Share C.
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { connect } from "node:net";
import { privateKeyToAddress } from "viem/accounts";

const ports = {
  app: { env: "PORT", port: Number(process.env.PORT ?? 3000) },
  anvil: { env: "RPC_PORT", port: Number(process.env.RPC_PORT ?? 8545) },
  partner: { env: "PARTNER_PORT", port: Number(process.env.PARTNER_PORT ?? 4002) },
};
const RPC_URL = `http://127.0.0.1:${ports.anvil.port}`;
const APP_URL = `http://localhost:${ports.app.port}`;
const PARTNER_URL = `http://localhost:${ports.partner.port}`;
const prod = process.argv.includes("--prod");
// Anvil's first prefunded account plays Swissquote.
const SWISSQUOTE_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const MARKER = "# Written by npm run local.";
const POLICY_FILE = "data/compliance-policy.json";

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

if (existsSync(".env.local") && !readFileSync(".env.local", "utf8").startsWith(MARKER)) {
  fail(".env.local was not written by npm run local. Move it aside first.");
}
for (const tool of ["anvil", "forge"]) {
  if (spawnSync(tool, ["--version"]).error) fail(`${tool} is not on your PATH. Install Foundry: https://getfoundry.sh`);
}
if (!existsSync("contracts/dependencies")) {
  console.log("Installing the contract dependencies (forge soldeer install)...");
  if (spawnSync("forge", ["soldeer", "install"], { cwd: "contracts", stdio: "inherit" }).status !== 0) {
    fail("forge soldeer install failed. Run it in contracts/ to see why.");
  }
}

const listening = (port: number) =>
  new Promise<boolean>((resolve) => {
    const socket = connect(port, "127.0.0.1");
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
  });

for (const [name, { env, port }] of Object.entries(ports)) {
  if (!(await listening(port))) continue;
  const lsof = spawnSync("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-Fpc"], { encoding: "utf8" }).stdout ?? "";
  const [pid, command] = [lsof.match(/^p(\d+)/m)?.[1], lsof.match(/^c(.+)/m)?.[1]];
  fail(
    `Port ${port} (${name}) is in use${pid ? ` by ${command}, pid ${pid}` : ""}. Stop it, or pick another port: ${env}=${port + 1} npm run local`,
  );
}

const children: ChildProcess[] = [];
// Each child leads its own process group, so stopping it also stops what it spawned (next dev's server).
process.on("exit", () => {
  for (const child of children) {
    try {
      process.kill(-child.pid!);
    } catch {}
  }
});
process.on("SIGINT", () => process.exit());
process.on("SIGTERM", () => process.exit());

function run(name: string, command: string, args: string[], env: Record<string, string> = {}) {
  const child = spawn(command, args, {
    env: { ...process.env, NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} --disable-warning=ExperimentalWarning`, ...env },
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  });
  const prefix = (chunk: Buffer) => chunk.toString().replace(/^(?=.)/gm, `[${name}] `);
  child.stdout!.on("data", (chunk) => process.stdout.write(prefix(chunk)));
  child.stderr!.on("data", (chunk) => process.stderr.write(prefix(chunk)));
  child.on("exit", (code) => fail(`[${name}] exited with ${code}. Stopping everything.`));
  children.push(child);
}

const answers = (url: string, init?: RequestInit) => fetch(url, init).then((res) => res.ok, () => false);
const rpcUp = () =>
  answers(RPC_URL, { method: "POST", headers: { "content-type": "application/json" }, body: '{"jsonrpc":"2.0","id":1,"method":"eth_chainId"}' });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

console.log(`Starting anvil on ${RPC_URL}`);
run("anvil", "anvil", ["--silent", "--port", String(ports.anvil.port)]);
while (!(await rpcUp())) await sleep(200);

// The chain is new, so the share vaults and CLI accounts from any previous run describe wallets that no longer exist.
rmSync("data", { recursive: true, force: true });
mkdirSync("data");

console.log("Deploying the contracts");
const deploy = spawnSync(
  "forge",
  ["script", "script/Deploy.s.sol", "--rpc-url", RPC_URL, "--private-key", SWISSQUOTE_KEY, "--broadcast"],
  { cwd: "contracts", encoding: "utf8", env: { ...process.env, SWISSQUOTE_ADDRESS: privateKeyToAddress(SWISSQUOTE_KEY), PAYMASTER_DEPOSIT: "10000000000000000000" } },
);
if (deploy.status !== 0) fail(`${deploy.stdout}\n${deploy.stderr}\nThe contracts did not deploy.`);
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
  CHAIN: "anvil",
  RPC_URL,
  SWISSQUOTE_KEY,
  SWISSQUOTE_ADDRESS: privateKeyToAddress(SWISSQUOTE_KEY),
  ...deployed,
  SWISSQUOTE_SHARE_KEY: randomBytes(32).toString("hex"),
  PARTNER_SHARE_KEY: randomBytes(32).toString("hex"),
  PARTNER_URL,
  NEXT_PUBLIC_PARTNER_URL: process.env.PUBLIC_PARTNER_URL ?? PARTNER_URL,
  APP_URL,
  COMPLIANCE_MODE: "demo",
  COMPLIANCE_POLICY_FILE: POLICY_FILE,
};
writeFileSync(".env.local", `${MARKER}\n${Object.entries(env).map(([k, v]) => `${k}=${v}`).join("\n")}\n`);

if (prod) {
  console.log("Building the app");
  const build = spawnSync("node_modules/.bin/next", ["build"], { stdio: "inherit", env: { ...process.env, ...env } });
  if (build.status !== 0) fail("next build failed.");
}
console.log(`Starting the partner on ${PARTNER_URL} and the app on ${APP_URL}`);
run("partner", "node", ["services/partner/server.ts"], env);
run("app", "node_modules/.bin/next", [prod ? "start" : "dev", "--port", String(ports.app.port)], env);
while (!(await answers(`${APP_URL}/api/config`))) await sleep(500);

// next dev compiles each route on its first request, about a second apiece. Asking for every screen and API
// route once now means the first tap in a demo answers at full speed.
const ZERO = "0x0000000000000000000000000000000000000000";
const routes = [
  "/onboarding-welcome", "/onboarding-secure", "/home", "/history", "/settings", "/choose-recipient", `/send?to=${ZERO}`,
  "/transaction-tracking", "/recover", "/coin-breakdown", "/plus", "/api/shares", "/api/wallets", "/api/recovery",
  `/api/wallets/${ZERO}`, `/api/wallets/${ZERO}/activity`, `/api/wallets/${ZERO}/operations`, `/api/wallets/${ZERO}/operations/${ZERO}`,
  `/api/wallets/${ZERO}/share`, `/api/wallets/${ZERO}/recovery`,
];
console.log("Warming up the app's screens and API");
await Promise.all(routes.map((route) => fetch(APP_URL + route).catch(() => undefined)));

console.log(`
Swissquote Wallet is running. Open ${APP_URL}/onboarding-welcome

  npm run status                     chain, contracts, wallets and accounts
  npm run fund [wallet] [amount]     mint test USDC (default: the newest wallet, 100)
  npm run account <name>             create a wallet with a software passkey
  npm run send <from> <to> <amount>  send USDC from an account
  npm run recover <account|file>     start a recovery onto a new phone
  npm run finish <account>           finish a recovery after the 48 hours
  npm run cancel <account>           cancel a recovery with the Recovery Key
  npm run warp [hours]               move chain time ahead (default 48)

Ctrl-C stops everything.
`);
