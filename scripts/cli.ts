// The protocol from a terminal, against npm run local. Each account is a phone simulated in Node,
// saved in data/accounts/<name>.json with its passkey, Recovery Key and device record.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { P256 } from "ox";
import { BaseError, erc20Abi, formatEther, formatUnits, HttpRequestError, isAddress, isAddressEqual, numberToHex, parseEventLogs, parseUnits, type Address, type Hex } from "viem";
import { entryPoint07Abi } from "viem/account-abstraction";
import { generatePrivateKey, privateKeyToAddress } from "viem/accounts";
import { foundry } from "viem/chains";
import { addresses, chain, credentials, partnerUrl, pendingRecovery, publicClient } from "../lib/wallet/env.ts";
import { ApiError, readRecoveryKey, RECOVERY_FILE, type Device } from "../lib/wallet/phone.ts";
import { DECIMALS, ethPrice, minOut, other, poolAbi, quoteOut, type PoolToken, type Reserves } from "../lib/wallet/pool.ts";
import { APP, mint, newPhone } from "./software-phone.ts";

type AccountFile = { passkey: Hex; recoveryKey: Hex; device: Device | null };
type Role = "active" | "recovering" | "inactive";

const ACCOUNTS = "data/accounts";
const NAME = /^[A-Za-z0-9_-]+$/;

function accountFile(name: string) {
  if (!NAME.test(name)) throw new Error(`"${name}" is not an account name. Use letters, digits, - and _ only.`);
  return `${ACCOUNTS}/${name}.json`;
}

// The phone keeps exactly one storage item, its device record, so every write leaves the file current.
function accountPhone(file: string, account: AccountFile) {
  return newPhone({
    passkey: account.passkey,
    storage: {
      getItem: () => (account.device ? JSON.stringify(account.device) : null),
      setItem(_key, value) {
        account.device = JSON.parse(value);
        writeFileSync(file, JSON.stringify(account, null, 2));
      },
      removeItem() {
        account.device = null;
        writeFileSync(file, JSON.stringify(account, null, 2));
      },
    },
  });
}

function loadAccount(name: string) {
  const file = accountFile(name);
  if (!existsSync(file)) throw new Error(`No account "${name}". Create one with npm run account ${name}.`);
  const account: AccountFile = JSON.parse(readFileSync(file, "utf8"));
  return { name, file, recoveryKey: account.recoveryKey, phone: accountPhone(file, account) };
}

function walletOf(arg: string): Address {
  if (isAddress(arg)) return arg;
  const address = loadAccount(arg).phone.device()?.address;
  if (!address) throw new Error(`${arg} has no wallet.`);
  return address;
}

function walletRows() {
  const path = process.env.SWISSQUOTE_DB ?? "data/swissquote.db";
  if (!existsSync(path)) return [];
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    return db.prepare("select address, config from wallets order by created_at").all() as { address: Address; config: string }[];
  } finally {
    db.close();
  }
}

// WETH is shown as ETH, as in the app.
const TOKENS = { usdc: "usdc", eth: "weth", weth: "weth" } as const satisfies Record<string, PoolToken>;
const show: Record<PoolToken, (amount: bigint) => string> = {
  usdc: (amount) => `${Number(formatUnits(amount, 6)).toFixed(2)} USDC`,
  weth: (amount) => `${Number(formatUnits(amount, 18)).toFixed(6)} ETH`,
};

function tokenOf(arg: string): PoolToken {
  const name = arg.toLowerCase();
  if (!Object.hasOwn(TOKENS, name)) throw new Error(`${arg} is not a token. Use usdc or eth.`);
  return TOKENS[name as keyof typeof TOKENS];
}

function baseUnits(text: string, token: PoolToken) {
  if (!new RegExp(`^\\d+(\\.\\d{1,${DECIMALS[token]}})?$`).test(text)) {
    throw new Error(`${text} is not ${token === "usdc" ? "a USDC amount, like 25 or 0.5" : "an ETH amount, like 1 or 0.05"}.`);
  }
  return parseUnits(text, DECIMALS[token]);
}

const balanceOf = (token: Address, owner: Address) => publicClient.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [owner] });
const usdcOf = (owner: Address) => balanceOf(addresses.usdc, owner);

async function balances(owner: Address) {
  const { weth } = addresses;
  const [usdc, eth] = await Promise.all([usdcOf(owner), weth && balanceOf(weth, owner)]);
  return [show.usdc(usdc), ...(eth === null ? [] : [show.weth(eth)])].join(", ");
}

async function reservesOf(pool: Address): Promise<Reserves> {
  const [usdc, weth] = await publicClient.readContract({ address: pool, abi: poolAbi, functionName: "reserves" });
  return { usdc, weth };
}

function duration(seconds: number) {
  const minutes = Math.ceil(seconds / 60);
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}
const when = (seconds: number) => new Date(seconds * 1000).toLocaleString();

// The pending block's timestamp is what the next transaction sees; the latest block's lags on an idle anvil.
async function chainClock() {
  const [number, pending] = await Promise.all([publicClient.getBlockNumber(), publicClient.getBlock({ blockTag: "pending" })]);
  return { number, time: Number(pending.timestamp) };
}

function drift(time: number) {
  const ahead = time - Date.now() / 1000;
  if (Math.abs(ahead) <= 60) return "in sync";
  return `${duration(Math.abs(ahead))} ${ahead > 0 ? "ahead of" : "behind"} the wall clock`;
}

function table(rows: string[][], indent = "  ") {
  const widths: number[] = [];
  for (const row of rows) row.forEach((cell, i) => (widths[i] = Math.max(widths[i] ?? 0, cell.length)));
  return rows.map((row) => (indent + row.map((cell, i) => cell.padEnd(widths[i])).join("  ")).trimEnd()).join("\n");
}

function roleOf(device: Device, live: { signer: Address; pendingRecovery: { signer: Address } | null }): Role {
  if (isAddressEqual(device.signer, live.signer)) return "active";
  if (live.pendingRecovery && isAddressEqual(live.pendingRecovery.signer, device.signer)) return "recovering";
  return "inactive";
}

const commands: Record<string, { usage: string; about: string; run(args: string[]): Promise<void> }> = {
  status: {
    usage: "status",
    about: "Show the chain, the contracts, Swissquote's gas funds, the swap pool, every wallet and the CLI accounts.",
    async run() {
      const rows = walletRows();
      const accounts = (existsSync(ACCOUNTS) ? readdirSync(ACCOUNTS) : [])
        .filter((file) => file.endsWith(".json"))
        .map((file) => file.slice(0, -".json".length))
        .sort()
        .map((name) => ({ name, ...(JSON.parse(readFileSync(accountFile(name), "utf8")) as AccountFile) }));
      const { weth, pool } = addresses;
      const [clock, gas, deposit, reserves, wallets] = await Promise.all([
        chainClock(),
        publicClient.getBalance({ address: addresses.swissquote }),
        publicClient.readContract({ address: addresses.entryPoint, abi: entryPoint07Abi, functionName: "balanceOf", args: [addresses.paymaster] }),
        pool && reservesOf(pool),
        Promise.all(
          rows.map(async ({ address, config }) => {
            const [balance, wethBalance, code, live, pending] = await Promise.all([
              usdcOf(address),
              weth && balanceOf(weth, address),
              publicClient.getCode({ address }),
              credentials(address, () => JSON.parse(config)),
              pendingRecovery(address),
            ]);
            return { address, balance, wethBalance, deployed: !!code, signer: live.signer, pendingRecovery: pending };
          }),
        ),
      ]);
      const eth = (wei: bigint) => `${Number(formatEther(wei)).toFixed(4)} ETH`;
      const owners = (address: Address) =>
        accounts.filter(({ device }) => device?.address?.toLowerCase() === address.toLowerCase()).map(({ name }) => name).join(", ");
      const walletLines = table(
        wallets.map((w) => [w.address, show.usdc(w.balance), ...(w.wethBalance === null ? [] : [show.weth(w.wethBalance)]), w.deployed ? "deployed" : "not deployed", owners(w.address)]),
      ).split("\n");
      const byAddress = new Map(wallets.map((w) => [w.address.toLowerCase(), w]));

      console.log(
        table(
          [
            ["Chain", `${process.env.CHAIN ?? chain.name} (${chain.id}), block ${clock.number}`],
            ["Chain time", `${when(clock.time)}, ${drift(clock.time)}`],
            ["App", APP],
            ["Partner", partnerUrl],
          ],
          "",
        ),
      );
      console.log("\nContracts");
      console.log(
        table([
          ["EntryPoint", addresses.entryPoint],
          ["USDC", addresses.usdc],
          ...(weth ? [["WETH", weth]] : []),
          ...(pool ? [["Pool", pool]] : []),
          ["Factory", addresses.factory],
          ["Paymaster", addresses.paymaster],
        ]),
      );
      console.log("\nSwissquote");
      console.log(
        table([
          ["Address", addresses.swissquote],
          ["Balance", eth(gas)],
          ["Paymaster deposit", eth(deposit)],
        ]),
      );
      if (reserves) {
        console.log("\nPool");
        console.log(
          table([
            ["Reserves", `${show.usdc(reserves.usdc)}, ${show.weth(reserves.weth)}`],
            ["ETH price", `1 ETH = ${ethPrice(reserves).toFixed(2)} USDC`],
          ]),
        );
      }
      console.log("\nWallets");
      if (!wallets.length) console.log("  No wallets yet.");
      wallets.forEach((wallet, i) => {
        console.log(walletLines[i]);
        if (!wallet.pendingRecovery) return;
        const left = wallet.pendingRecovery.executeAfter - clock.time;
        console.log(`    recovery pending, ${left > 0 ? `can finish in ${duration(left)}` : "can finish now"}`);
      });
      console.log("\nAccounts");
      if (!accounts.length) console.log("  No CLI accounts. Create one with npm run account <name>.");
      else
        console.log(
          table(
            accounts.map(({ name, device }) => {
              if (!device?.address) return [name, "no wallet"];
              const live = byAddress.get(device.address.toLowerCase());
              return [name, device.address, live ? roleOf(device, live) : "unknown wallet"];
            }),
          ),
        );
    },
  },

  fund: {
    usage: "fund [wallet] [amount] [usdc|eth]",
    about: "Mint test USDC (100 by default) or ETH as WETH (1 by default) to an account or address, by default the newest wallet.",
    async run([target, amountArg, tokenArg = "usdc"]) {
      const token = tokenOf(tokenArg);
      const amount = amountArg ?? { usdc: "100", weth: "1" }[token];
      baseUnits(amount, token);
      const to = target ? walletOf(target) : walletRows().at(-1)?.address;
      if (!to) throw new Error("No wallets yet. Create one in the browser or with npm run account <name>.");
      await mint(token, to, amount);
      console.log(
        table(
          [
            ["Wallet", to],
            ["Balance", await balances(to)],
          ],
          "",
        ),
      );
    },
  },

  account: {
    usage: "account <name>",
    about: "Create a wallet with a software passkey, save its Recovery Key file and fund it with 100 USDC.",
    async run([name]) {
      const file = accountFile(name);
      if (existsSync(file) && loadAccount(name).phone.hasWallet()) throw new Error(`Account "${name}" exists already.`);
      mkdirSync(ACCOUNTS, { recursive: true });
      const account: AccountFile = { passkey: P256.randomPrivateKey(), recoveryKey: generatePrivateKey(), device: null };
      const phone = accountPhone(file, account);
      await phone.splitKey(await phone.createPasskey());
      const wallet = await phone.register(privateKeyToAddress(account.recoveryKey));
      const keyFile = `${ACCOUNTS}/${name} Recovery Key.txt`;
      writeFileSync(keyFile, RECOVERY_FILE.text(account.recoveryKey));
      await mint("usdc", wallet, "100");
      console.log(
        table(
          [
            ["Wallet", wallet],
            ["Account", file],
            ["Recovery Key", keyFile],
            ["Balance", show.usdc(await usdcOf(wallet))],
          ],
          "",
        ),
      );
    },
  },

  send: {
    usage: "send <from-account> <to> <amount>",
    about: "Send USDC from an account to an address or another account.",
    async run([fromName, toArg, amount]) {
      baseUnits(amount, "usdc");
      const from = loadAccount(fromName);
      const to = walletOf(toArg);
      const hash = await from.phone.sendUsdc(to, amount);
      const [fromBalance, toBalance] = await Promise.all([usdcOf(from.phone.device()!.address!), usdcOf(to)]);
      console.log(
        table(
          [
            ["Transaction", hash],
            [fromName, show.usdc(fromBalance)],
            [toArg, show.usdc(toBalance)],
          ],
          "",
        ),
      );
    },
  },

  swap: {
    usage: "swap <account> <amount> <usdc|eth>",
    about: "Swap USDC for ETH or ETH for USDC through the test pool. The amount is what the account pays.",
    async run([name, amountArg, tokenArg]) {
      const tokenIn = tokenOf(tokenArg);
      const amountIn = baseUnits(amountArg, tokenIn);
      const { pool } = addresses;
      if (!pool) throw new Error("This chain has no swap pool. npm run local deploys one on anvil.");
      const { phone } = loadAccount(name);
      const wallet = walletOf(name);
      const held = await balanceOf(addresses[tokenIn]!, wallet);
      if (held < amountIn) throw new Error(`${name} has ${show[tokenIn](held)}, not the ${show[tokenIn](amountIn)} to swap.`);
      const quote = quoteOut(await reservesOf(pool), tokenIn, amountIn);
      const hash = await phone.swap(tokenIn, amountIn, minOut(quote));
      const { logs } = await publicClient.getTransactionReceipt({ hash });
      const [swapped] = parseEventLogs({ abi: poolAbi, eventName: "Swap", logs, args: { account: wallet } });
      const { amountOut } = swapped.args;
      const legs = tokenIn === "usdc" ? { usdc: amountIn, weth: amountOut } : { usdc: amountOut, weth: amountIn };
      console.log(
        table(
          [
            ["Transaction", hash],
            ["Paid", show[tokenIn](amountIn)],
            ["Got", show[other(tokenIn)](amountOut)],
            ["Rate", `1 ETH = ${ethPrice(legs).toFixed(2)} USDC`],
            ["Balance", await balances(wallet)],
          ],
          "",
        ),
      );
    },
  },

  recover: {
    usage: "recover <account | Recovery Key file> [new-name]",
    about: "Start a recovery onto a new software phone. It can finish after 48 hours.",
    async run([source, target]) {
      const named = NAME.test(source) && existsSync(accountFile(source));
      if (!named && !existsSync(source)) throw new Error(`No account or Recovery Key file "${source}".`);
      const secret = named ? loadAccount(source).recoveryKey : readRecoveryKey(readFileSync(source, "utf8"));
      if (!secret) throw new Error(`${source} holds no recovery key.`);
      const name = target ?? (named ? `${source}-new` : "recovered");
      const file = accountFile(name);
      if (existsSync(file)) {
        const { phone } = loadAccount(name);
        if (phone.hasWallet() && roleOf(phone.device()!, await phone.state()) === "active") {
          throw new Error(`${name} already controls ${phone.device()!.address}. Pick another name: npm run recover ${source} <other-name>.`);
        }
      }
      mkdirSync(ACCOUNTS, { recursive: true });
      const account: AccountFile = { passkey: P256.randomPrivateKey(), recoveryKey: secret, device: null };
      const phone = accountPhone(file, account);
      await phone.splitKey(await phone.createPasskey());
      const { address, executeAfter } = await phone.startRecovery(secret, { document: "id-card-scan", selfie: "selfie" });
      const { time } = await chainClock();
      console.log(
        table(
          [
            ["Wallet", address],
            ["Account", name],
            ["Can finish", `${when(executeAfter)}, in ${duration(executeAfter - time)}`],
            ["To cancel", `npm run cancel ${name}`],
            ["To finish", `npm run warp, then npm run finish ${name}`],
          ],
          "",
        ),
      );
    },
  },

  finish: {
    usage: "finish <account>",
    about: "Finish a recovery after the 48-hour delay.",
    async run([name]) {
      const { phone } = loadAccount(name);
      const device = phone.device();
      if (!device?.address) throw new Error(`${name} has no wallet.`);
      const [pending, clock] = await Promise.all([pendingRecovery(device.address), chainClock()]);
      if (!pending) throw new Error(`No recovery is pending for ${name}'s wallet.`);
      if (!isAddressEqual(pending.signer, device.signer)) throw new Error(`The recovery pending on ${device.address} is another phone's, not ${name}'s.`);
      if (pending.executeAfter > clock.time) {
        throw new Error(`Too early. ${name}'s recovery can finish in ${duration(pending.executeAfter - clock.time)}. Run npm run warp to skip ahead.`);
      }
      const { transactionHash } = await phone.finalizeRecovery();
      console.log(`${name} now controls ${device.address}.`);
      console.log(table([["Transaction", transactionHash]], ""));
    },
  },

  cancel: {
    usage: "cancel <account>",
    about: "Cancel a pending recovery through Swissquote, signed with the Recovery Key.",
    async run([name]) {
      const { phone, recoveryKey } = loadAccount(name);
      const hash = await phone.cancelRecoveryWithSwissquote(recoveryKey);
      console.log("Recovery cancelled.");
      console.log(
        table(
          [
            ["Wallet", phone.device()!.address!],
            ["Transaction", hash],
          ],
          "",
        ),
      );
    },
  },

  warp: {
    usage: "warp [hours=48]",
    about: "Move chain time ahead, so a pending recovery can finish.",
    async run([hours = "48"]) {
      const seconds = Math.round(Number(hours) * 3600);
      if (!Number.isFinite(seconds) || seconds <= 0) throw new Error(`${hours} is not a number of hours, like 48.`);
      if (chain.id !== foundry.id) throw new Error("warp only works on the local anvil chain.");
      await publicClient.request({ method: "evm_increaseTime", params: [numberToHex(seconds)] } as never);
      await publicClient.request({ method: "evm_mine", params: [] } as never);
      const { time } = await chainClock();
      console.log(`Chain time is now ${when(time)}, ${drift(time)}.`);
    },
  },
};

function explain(error: unknown): string {
  for (let e: unknown = error; e instanceof Error; e = e.cause) {
    // An HttpRequestError with a status means the RPC answered, with an error.
    if (e instanceof HttpRequestError && !e.status) return `Nothing answers at ${e.url}. Start the stack with npm run local.`;
    if (e instanceof TypeError && e.message === "fetch failed") {
      const cause = e.cause as { port?: number; errors?: { port?: number }[] } | undefined;
      const port = String(cause?.port ?? cause?.errors?.[0]?.port);
      return `Nothing answers at ${[APP, partnerUrl].find((url) => new URL(url).port === port) ?? APP}. Start the stack with npm run local.`;
    }
  }
  if (error instanceof ApiError) {
    if (String(error.body.detail).startsWith("Slippage(")) {
      return "The price moved before the swap went through, so the pool would have paid less than the swap's minimum. Nothing was swapped. Run it again for a fresh quote.";
    }
    const decision = error.body.decision as { status: string; reasons: string[] } | undefined;
    if (!decision) return `Swissquote refused: ${error.message}`;
    return `Swissquote refused: ${error.message}\n${table([["Decision", decision.status], ...decision.reasons.map((reason) => ["Reason", reason])])}`;
  }
  if (error instanceof BaseError) return error.shortMessage;
  return error instanceof Error ? error.message : String(error);
}

const [commandName, ...args] = process.argv.slice(2);
const list = () => table(Object.values(commands).map(({ usage, about }) => [`npm run ${usage}`, about]));

if (!commandName) {
  console.log(list());
  process.exit(0);
}
if (!Object.hasOwn(commands, commandName)) {
  console.error(`Unknown command "${commandName}".\n${list()}`);
  process.exit(1);
}
const command = commands[commandName];
try {
  if (args.length < (command.usage.match(/<[^>]+>/g)?.length ?? 0)) throw new Error(`Usage: npm run ${command.usage}\n${command.about}`);
  if (!process.env.USDC_ADDRESS) throw new Error("No .env.local. Start the stack with npm run local.");
  await command.run(args);
} catch (error) {
  console.error(explain(error));
  process.exit(1);
}
