// Runs the whole stack on a fresh local chain: anvil, the contracts, the partner service and the
// app. Writes .env.local for the app, the partner, the CLI (npm run status, fund, ...) and npm run e2e.
//
//   npm run local            (PORT, RPC_PORT and PARTNER_PORT pick other ports)
//   npm run local -- --prod  a public demo behind a tunnel: a production build instead of next dev, and the chain,
//                            the share vaults and their keys kept in data/ across restarts, so a redeploy keeps every
//                            wallet. Delete data/ for a fresh chain, as after a contract change. PUBLIC_PARTNER_URL is
//                            the partner's public URL, where phones post Share C.
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { connect } from "node:net";
import { parseEnv } from "node:util";
import type { Hex } from "viem";
import { generatePrivateKey, privateKeyToAddress } from "viem/accounts";
import { setSunset } from "../lib/wallet/sunset.ts";
import { localDappPolicy } from "../services/dapps/local-policy.ts";

const ports = {
  app: { env: "PORT", port: Number(process.env.PORT ?? 3000) },
  anvil: { env: "RPC_PORT", port: Number(process.env.RPC_PORT ?? 8545) },
  partner: { env: "PARTNER_PORT", port: Number(process.env.PARTNER_PORT ?? 4002) },
};
const RPC_URL = `http://127.0.0.1:${ports.anvil.port}`;
const APP_URL = `http://localhost:${ports.app.port}`;
const PARTNER_URL = `http://localhost:${ports.partner.port}`;
const prod = process.argv.includes("--prod");
const MARKER = "# Written by npm run local.";
const POLICY_FILE = "data/compliance-policy.json";
const STATE = "data/chain.json";
// The independent service's own secret lives outside .env.local, which next dev loads into Swissquote's app.
const PARTNER_ENV = "data/partner.env";

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

// --prod picks up the chain it saved last time, with the contracts, keys and policy that go with it.
const resume = prod && existsSync(STATE) && existsSync(".env.local");
const previous = resume ? parseEnv(readFileSync(".env.local", "utf8")) : {};
// Anvil's first prefunded account plays Swissquote on a dev chain, where the tests know it. A public demo's chain
// gets a Swissquote key no one else knows, since that key signs the sponsorships and the tickets the partner trusts.
const ANVIL_ACCOUNT_0 = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const SWISSQUOTE_KEY = (resume ? previous.SWISSQUOTE_KEY ?? fail(".env.local has no SWISSQUOTE_KEY. Delete data/ for a fresh chain.") : prod ? generatePrivateKey() : ANVIL_ACCOUNT_0) as Hex;

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
      if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(child.pid), "/t", "/f"], { stdio: "ignore" });
      else process.kill(-child.pid!);
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
const rpc = (method: string, params: unknown[] = []) =>
  answers(RPC_URL, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
const rpcUp = () => rpc("eth_chainId");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function waitFor(what: string, up: () => Promise<boolean>, seconds = prod ? 300 : 120) {
  for (const start = Date.now(); !(await up()); await sleep(250)) {
    if (Date.now() - start > seconds * 1000) fail(`${what} did not start within ${seconds} s. Its log above says why.`);
  }
}

if (!resume) {
  // The chain is new, so the share vaults and CLI accounts from any previous run describe wallets that no longer exist.
  rmSync("data", { recursive: true, force: true });
  mkdirSync("data");
}
// A resumed --prod run keeps data/, and with it a sunset left on last time.
setSunset(false);

console.log(`Starting anvil on ${RPC_URL}`);
run("anvil", "anvil", ["--silent", "--port", String(ports.anvil.port), ...(prod ? ["--state", STATE, "--state-interval", "5"] : [])]);
await waitFor(`anvil on ${RPC_URL}`, rpcUp);
// A fresh key holds nothing: 10,000 ETH, like anvil's own accounts, pays the deployment, the paymaster deposit and the gas.
if (!resume && SWISSQUOTE_KEY !== ANVIL_ACCOUNT_0 && !(await rpc("anvil_setBalance", [privateKeyToAddress(SWISSQUOTE_KEY), "0x21e19e0c9bab2400000"]))) {
  fail("anvil did not fund Swissquote's key.");
}

const deployed = resume ? (Object.fromEntries(Object.entries(previous).filter(([k]) => k.endsWith("_ADDRESS"))) as Record<string, string>) : deployContracts();
if (resume) console.log(`Resumed the chain in ${STATE}`);

function deployContracts() {
  console.log("Deploying the contracts");
  const deploy = spawnSync(
    "forge",
    ["script", "script/Deploy.s.sol", "--rpc-url", RPC_URL, "--private-key", SWISSQUOTE_KEY, "--broadcast"],
    { cwd: "contracts", encoding: "utf8", env: { ...process.env, SWISSQUOTE_ADDRESS: privateKeyToAddress(SWISSQUOTE_KEY), PAYMASTER_DEPOSIT: "10000000000000000000" } },
  );
  if (deploy.status !== 0) fail(`${deploy.stdout}\n${deploy.stderr}\nThe contracts did not deploy.`);
  return Object.fromEntries([...deploy.stdout.matchAll(/([A-Z_]+_ADDRESS)=(0x[0-9a-fA-F]{40})/g)].map((m) => [m[1], m[2]]));
}

// New chains include the deployed test vault. Never silently expand a resumed chain's policy.
if (!resume || !existsSync(POLICY_FILE)) writeFileSync(POLICY_FILE, JSON.stringify(localDappPolicy(deployed.USDC_ADDRESS, deployed.VAULT_ADDRESS)));
if (resume && !deployed.VAULT_ADDRESS) console.log("This older chain has no test vault. Its wallets and policy are preserved; deploy and review a vault explicitly to enable dApps.");

const env = {
  CHAIN: "anvil",
  RPC_URL,
  SWISSQUOTE_KEY,
  SWISSQUOTE_ADDRESS: privateKeyToAddress(SWISSQUOTE_KEY),
  ...deployed,
  SWISSQUOTE_SHARE_KEY: previous.SWISSQUOTE_SHARE_KEY ?? randomBytes(32).toString("hex"),
  PARTNER_URL,
  NEXT_PUBLIC_PARTNER_URL: process.env.PUBLIC_PARTNER_URL ?? PARTNER_URL,
  APP_URL,
  // Seconds Swissquote must stay closed before the partner opens the exit. Production waits 30 days; the
  // public demo waits long enough that a redeploy never opens it. EXIT_AFTER=5 lets npm run e2e prove a --prod stack.
  EXIT_AFTER: process.env.EXIT_AFTER ?? (prod ? "600" : "5"),
  COMPLIANCE_MODE: "demo",
  COMPLIANCE_POLICY_FILE: POLICY_FILE,
};
writeFileSync(".env.local", `${MARKER}\n${Object.entries(env).map(([k, v]) => `${k}=${v}`).join("\n")}\n`);

if (prod) {
  console.log("Building the app");
  const build = spawnSync(process.execPath, ["node_modules/next/dist/bin/next", "build"], { stdio: "inherit", env: { ...process.env, ...env } });
  if (build.status !== 0) fail("next build failed.");
}
// Each process gets only its own secrets: the partner never sees Swissquote's keys, the app never sees
// the partner's. The partner needs only Swissquote's public address to check its tickets.
const partnerKey = (existsSync(PARTNER_ENV) && parseEnv(readFileSync(PARTNER_ENV, "utf8")).PARTNER_SHARE_KEY) || previous.PARTNER_SHARE_KEY || randomBytes(32).toString("hex");
writeFileSync(PARTNER_ENV, `PARTNER_SHARE_KEY=${partnerKey}\n`);
const { SWISSQUOTE_KEY: _key, SWISSQUOTE_SHARE_KEY: _share, COMPLIANCE_MODE: _mode, COMPLIANCE_POLICY_FILE: _policy, ...shared } = env;
console.log(`Starting the partner on ${PARTNER_URL} and the app on ${APP_URL}`);
run("partner", "node", ["services/partner/server.ts"], { ...shared, PARTNER_SHARE_KEY: partnerKey });
run("app", process.execPath, ["node_modules/next/dist/bin/next", prod ? "start" : "dev", "--port", String(ports.app.port)], env);
await waitFor(`the partner on ${PARTNER_URL}`, () => listening(ports.partner.port));
await waitFor(`the app on ${APP_URL}`, () => answers(`${APP_URL}/api/config`));

// next dev compiles each route on its first request, about a second apiece. Asking for every screen and API
// route once now means the first tap in a demo answers at full speed.
const ZERO = "0x0000000000000000000000000000000000000000";
const routes = [
  "/onboarding-welcome", "/onboarding-secure", "/home", "/history", "/settings", "/choose-recipient", `/send?to=${ZERO}`,
  "/transaction-tracking", "/recover", "/coin-breakdown", "/plus", "/dapps", "/api/dapps", "/api/shares", "/api/wallets", "/api/recovery", "/api/session",
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
  npm run send <from> <to> <amount>  send USDC from an account; over 1,000 USDC, Swissquote holds it 24 hours
  npm run cancel-payment <account>   cancel held payments with the Recovery Key
  npm run recover <account|file>     start a recovery onto a new phone
  npm run finish <account>           finish a recovery after the 48 hours
  npm run cancel <account>           cancel a recovery with the Recovery Key
  npm run cancel-payment <account>   cancel an account's held payments with the Recovery Key
  npm run lock <account>             report the phone lost: Swissquote locks it
  npm run unlock <account>           Swissquote unlocks the phone
  npm run warp [hours]               move chain time ahead (default 48); held payments that are due leave
  npm run sunset [on|off]            close Swissquote's services, or run them again (default on)
  npm run exit <from> <to> [amount]  send USDC without Swissquote once it is closed (default all)
  npm run attack <account>           an attacker with the phone and email is stopped at every step

Ctrl-C stops everything.
`);
