// The protocol from a terminal, against npm run local. Each account is a phone simulated in Node,
// saved in data/accounts/<account>.json with its passkey, Recovery Key and device record.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { setTimeout as sleep } from "node:timers/promises";
import { P256 } from "ox";
import {
  BaseError,
  erc20Abi,
  formatEther,
  formatUnits,
  HttpRequestError,
  isAddress,
  isAddressEqual,
  numberToHex,
  parseEther,
  type Address,
  type Hex,
} from "viem";
import { entryPoint07Abi } from "viem/account-abstraction";
import { generatePrivateKey, privateKeyToAddress } from "viem/accounts";
import { foundry } from "viem/chains";
import { ownershipChallenge, type Config as AccountConfig, type Passkey } from "../lib/wallet/account.ts";
import { verifyAssertion } from "../lib/wallet/api/http.ts";
import { addresses, chain, credentials, partnerUrl, pendingRecovery, plus, publicClient } from "../lib/wallet/env.ts";
import { ApiError, readRecoveryKey, RECOVERY_FILE, type Device, type SignedIn } from "../lib/wallet/phone.ts";
import { setSunset } from "../lib/wallet/sunset.ts";
import { attack } from "./attack.ts";
import { APP, mintUsdc, newPhone, sendEth } from "./software-phone.ts";

/** `signedIn`: the Swissquote client the account's wallet is linked to (mocked). None until npm run link. */
type AccountFile = { passkey: Hex; recoveryKey: Hex; device: Device | null; signedIn?: SignedIn };
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
    session: () => account.signedIn?.session,
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
  return { name, file, saved: account, recoveryKey: account.recoveryKey, signedIn: account.signedIn, phone: accountPhone(file, account) };
}

function walletOf(arg: string): Address {
  if (isAddress(arg)) return arg;
  const address = loadAccount(arg).phone.device()?.address;
  if (!address) throw new Error(`${arg} has no wallet.`);
  return address;
}

/** Swissquote locks or unlocks the live credentials of an account's wallet, asked by its Recovery Key. */
async function setLock(name: string, locked: boolean) {
  const { phone, recoveryKey } = loadAccount(name);
  await phone.lockPhone(recoveryKey, locked).catch((error: unknown) => {
    if (error instanceof ApiError && error.body.refused === "unlinked") {
      throw new Error(`${name}'s wallet isn't linked to a Swissquote client, so Swissquote can't ${locked ? "lock" : "unlock"} its phone.`);
    }
    throw error;
  });
  const { address, signer } = await phone.state();
  return { wallet: address, signer };
}

/** Reads Swissquote's database; nothing before the app first opened it. */
function query<T>(sql: string): T[] {
  const path = process.env.SWISSQUOTE_DB ?? "data/swissquote.db";
  if (!existsSync(path)) return [];
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    return db.prepare(sql).all() as T[];
  } finally {
    db.close();
  }
}

// Swissquote's own view: each wallet's owner and when the owner's Plus ends, which only the bank sees.
const walletRows = () =>
  query<{ address: Address; config: string; client: string | null; assertion: string | null; plusUntil: number | null }>(
    `select address, config, links.client, links.assertion, (select max(until) from plus where plus.client = links.client) as plusUntil
     from wallets left join links on links.wallet = wallets.address order by wallets.created_at`,
  );

/**
 * Who owns the wallet, and whether the wallet's passkey signed, with Face ID, the ownership statement Swissquote keeps:
 * the passkey it was created with, or the one it has now.
 */
function ownerLine(wallet: Address, passkeys: Passkey[], client: string, assertion: string) {
  // ponytail: a link made between two recoveries was signed by a passkey that is neither; the recovery events on-chain name it.
  const signed = passkeys.some((passkey) => verifyAssertion(JSON.parse(assertion), ownershipChallenge(client, wallet), passkey));
  return `owner: Swissquote client ${client} (mock), ${signed ? "ownership signed with Face ID by the wallet's passkey" : "OWNERSHIP PROOF DOES NOT MATCH THE WALLET'S PASSKEY"}`;
}

function usdcAmount(text: string) {
  if (!/^\d+(\.\d{1,6})?$/.test(text)) throw new Error(`${text} is not a USDC amount, like 25 or 0.5.`);
}

const usdcOf = (owner: Address) => publicClient.readContract({ address: addresses.usdc, abi: erc20Abi, functionName: "balanceOf", args: [owner] });
const usdc = (amount: bigint) => `${Number(formatUnits(amount, 6)).toFixed(2)} USDC`;
const eth = (wei: bigint) => `${Number(formatEther(wei)).toFixed(4)} ETH`;

/** Test USDC, and the ETH an unlinked wallet pays its network fees with: Swissquote pays only a linked wallet's. */
async function fundWallet(to: Address, amount: string) {
  await mintUsdc(to, amount);
  if (chain.id === foundry.id) return sendEth(to, "0.01");
  console.log(`Sending ETH only works on anvil. Get Base Sepolia ETH for ${to} at https://docs.base.org/base-chain/network-information/network-faucets.`);
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
    about: "Show the chain, the contracts, Swissquote's gas funds, every wallet and the CLI accounts.",
    async run() {
      const rows = walletRows();
      const accounts = (existsSync(ACCOUNTS) ? readdirSync(ACCOUNTS) : [])
        .filter((file) => file.endsWith(".json"))
        .map((file) => file.slice(0, -".json".length))
        .sort()
        .map((name) => ({ name, ...(JSON.parse(readFileSync(accountFile(name), "utf8")) as AccountFile) }));
      const [clock, gas, deposit, wallets] = await Promise.all([
        chainClock(),
        publicClient.getBalance({ address: addresses.swissquote }),
        publicClient.readContract({ address: addresses.entryPoint, abi: entryPoint07Abi, functionName: "balanceOf", args: [addresses.paymaster] }),
        Promise.all(
          rows.map(async ({ address, config, client, assertion, plusUntil }) => {
            const created = JSON.parse(config) as AccountConfig;
            const [balance, code, live, pending] = await Promise.all([
              usdcOf(address),
              publicClient.getCode({ address }),
              credentials(address, () => created),
              pendingRecovery(address),
            ]);
            const owner = client && assertion && ownerLine(address, [created.passkey, live.passkey], client, assertion);
            return { address, balance, deployed: !!code, signer: live.signer, pendingRecovery: pending, owner, plusUntil };
          }),
        ),
      ]);
      const owners = (address: Address) =>
        accounts.filter(({ device }) => device?.address?.toLowerCase() === address.toLowerCase()).map(({ name }) => name).join(", ");
      const walletLines = table(wallets.map((w) => [w.address, usdc(w.balance), w.deployed ? "deployed" : "not deployed", owners(w.address)])).split("\n");
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
      console.log("\nWallets");
      if (!wallets.length) console.log("  No wallets yet.");
      wallets.forEach((wallet, i) => {
        console.log(walletLines[i]);
        console.log(`    ${wallet.owner ?? "not linked to a Swissquote client"}`);
        if (wallet.owner) console.log(`    ${wallet.plusUntil ? `Swissquote Plus ${wallet.plusUntil > clock.time ? "until" : "ended"} ${when(wallet.plusUntil)}` : "no Swissquote Plus"}`);
        if (!wallet.pendingRecovery) return;
        const left = wallet.pendingRecovery.executeAfter - clock.time;
        console.log(`    recovery pending, ${left > 0 ? `can finish in ${duration(left)}` : "can finish now"}`);
      });
      console.log("\nAccounts");
      if (!accounts.length) console.log("  No CLI accounts. Create one with npm run account <account>.");
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
    usage: "fund [wallet] [amount=100]",
    about: "Mint test USDC to an account or address, by default the newest wallet, and send it 0.01 ETH for network fees.",
    async run([target, amount = "100"]) {
      usdcAmount(amount);
      const to = target ? walletOf(target) : walletRows().at(-1)?.address;
      if (!to) throw new Error("No wallets yet. Create one in the browser or with npm run account <account>.");
      await fundWallet(to, amount);
      console.log(
        table(
          [
            ["Wallet", to],
            ["Balance", `${usdc(await usdcOf(to))}, ${eth(await publicClient.getBalance({ address: to }))}`],
          ],
          "",
        ),
      );
    },
  },

  account: {
    usage: "account <account>",
    about: "Create a wallet with a software passkey, not linked to a Swissquote client, save its Recovery Key file and fund it with 100 USDC and 0.01 ETH.",
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
      await fundWallet(wallet, "100");
      console.log(
        table(
          [
            ["Wallet", wallet],
            ["Swissquote", `not linked to a client. To link it: npm run link ${name}`],
            ["Account", file],
            ["Recovery Key", keyFile],
            ["Balance", `${usdc(await usdcOf(wallet))}, ${eth(await publicClient.getBalance({ address: wallet }))}`],
          ],
          "",
        ),
      );
    },
  },

  link: {
    usage: "link <account>",
    about: "Link an account's wallet to a Swissquote client (mocked): the wallet's passkey signs, with Face ID, that the wallet is theirs.",
    async run([name]) {
      const { file, saved: account, phone } = loadAccount(name);
      if (!phone.hasWallet()) throw new Error(`${name} has no wallet.`);
      account.signedIn = await phone.link(await phone.signIn(account.signedIn?.session));
      writeFileSync(file, JSON.stringify(account, null, 2));
      console.log(
        table(
          [
            ["Wallet", phone.device()!.address!],
            ["Client", `Swissquote client ${account.signedIn.client.number} (mock)`],
          ],
          "",
        ),
      );
    },
  },

  plus: {
    usage: "plus <account>",
    about: `Buy ${plus.period / 86_400} days of Swissquote Plus for a linked account's client: the wallet pays Swissquote ${formatUnits(plus.price, 6)} USDC, with Face ID. Buying again extends it.`,
    async run([name]) {
      const { phone, signedIn } = loadAccount(name);
      const wallet = phone.device()?.address;
      if (!wallet) throw new Error(`${name} has no wallet.`);
      if (!signedIn) throw new Error(`Swissquote Plus is for Swissquote clients. Link ${name}'s wallet first: npm run link ${name}`);
      const until = await phone.buyPlus();
      console.log(
        table(
          [
            ["Client", `Swissquote client ${signedIn.client.number} (mock)`],
            ["Plus until", when(until)],
            ["Balance", usdc(await usdcOf(wallet))],
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
      usdcAmount(amount);
      const from = loadAccount(fromName);
      const to = walletOf(toArg);
      const sent = await from.phone.sendUsdc(to, amount);
      const [fromBalance, toBalance] = await Promise.all([usdcOf(from.phone.device()!.address!), usdcOf(to)]);
      console.log(
        table(
          [
            ["Transaction", sent.transactionHash],
            [fromName, usdc(fromBalance)],
            [toArg, usdc(toBalance)],
          ],
          "",
        ),
      );
    },
  },

  recover: {
    usage: "recover <account | Recovery Key file> [new-account]",
    about: "Start a recovery onto a new software phone with the Recovery Key, the same for a linked wallet. It can finish after 48 hours.",
    async run([source, target]) {
      const owner = NAME.test(source) && existsSync(accountFile(source)) ? loadAccount(source) : undefined;
      if (!owner && !existsSync(source)) throw new Error(`No account or Recovery Key file "${source}".`);
      const secret = owner ? owner.recoveryKey : readRecoveryKey(readFileSync(source, "utf8"));
      if (!secret) throw new Error(`${source} holds no recovery key.`);
      const name = target ?? (owner ? `${source}-new` : "recovered");
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
      const { linked } = await phone.findRecovery(secret);
      await phone.splitKey(await phone.createPasskey());
      const { address, executeAfter } = await phone.startRecovery(secret);
      const { time } = await chainClock();
      console.log(
        table(
          [
            ["Wallet", address],
            ["Account", name],
            ["Can finish", `${when(executeAfter)}, in ${duration(executeAfter - time)}`],
            ["To cancel", `npm run cancel ${name}`],
            ["To finish", `npm run warp, then npm run finish ${name}`],
            ...(linked ? [["To link", `once finished, npm run link ${name} signs it in as the wallet's Swissquote client`]] : []),
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

  attack: {
    usage: "attack <account>",
    about: "An attacker with the account's phone and email inbox tries to take its wallet, then with the Recovery Key too; for a linked wallet also with Face ID, once the owner has Swissquote lock the phone. Every attempt must fail.",
    async run([name]) {
      const { phone, recoveryKey } = loadAccount(name);
      const device = phone.device();
      if (!device?.address) throw new Error(`${name} has no wallet.`);
      const { pendingRecovery, locked } = await phone.state();
      if (pendingRecovery) throw new Error(`A recovery is pending for ${name}'s wallet. Cancel it first: npm run cancel ${name}.`);
      if (locked) throw new Error(`Swissquote has locked ${name}'s phone. Unlock it first: npm run unlock ${name}.`);
      const { linked } = await phone.findRecovery(recoveryKey);
      await attack({ phone: structuredClone(device), homeKey: recoveryKey, unlocked: phone, linked });
      console.log(`Every attempt on ${name}'s wallet failed.`);
    },
  },

  lock: {
    usage: "lock <account>",
    about: "Report an account's phone lost with its Recovery Key: Swissquote locks the phone's credentials. Only for a linked wallet.",
    async run([name]) {
      const { wallet, signer } = await setLock(name, true);
      console.log(`Swissquote refuses Share B, sponsorship and submission for this phone until a recovery replaces it or npm run unlock ${name}.`);
      console.log(
        table(
          [
            ["Wallet", wallet],
            ["Phone key", signer],
          ],
          "",
        ),
      );
    },
  },

  unlock: {
    usage: "unlock <account>",
    about: "Swissquote unlocks the phone, asked by the Recovery Key.",
    async run([name]) {
      const { wallet, signer } = await setLock(name, false);
      console.log("This phone can send again.");
      console.log(
        table(
          [
            ["Wallet", wallet],
            ["Phone key", signer],
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

  sunset: {
    usage: "sunset [on|off]",
    about: "Close Swissquote's services, as if gone for good, or run them again.",
    async run([state = "on"]) {
      if (state !== "on" && state !== "off") throw new Error(`${state} is not on or off.`);
      setSunset(state === "on");
      console.log(state === "on" ? "Swissquote's services are closed until npm run sunset off." : "Swissquote's services are running again.");
    },
  },

  exit: {
    usage: "exit <account> <to> [amount=all]",
    about: "Send USDC without Swissquote, once its services have been closed long enough.",
    async run([name, toArg, amount = "all"]) {
      if (amount !== "all") usdcAmount(amount);
      const { phone } = loadAccount(name);
      const wallet = walletOf(name);
      const to = walletOf(toArg);
      let status = await phone.exitStatus();
      if (!status.alive && !status.open) {
        const left = status.exitAfter - status.closedFor;
        if (left > 60) throw new Error(`Swissquote's services have been closed for ${duration(status.closedFor)}. The exit opens in ${duration(left)}.`);
        console.log(`Swissquote's services have been closed for ${status.closedFor} s. The exit opens in ${left} s.`);
        while (!status.alive && !status.open) {
          await sleep(1000);
          status = await phone.exitStatus();
        }
      }
      if (status.alive) throw new Error("Swissquote's services are running. Pay with npm run send, or close them with npm run sunset.");
      if (amount === "all") {
        const balance = await usdcOf(wallet);
        if (!balance) throw new Error(`${name}'s wallet holds no USDC.`);
        amount = formatUnits(balance, 6);
      }
      if ((await publicClient.getBalance({ address: wallet })) < parseEther("0.005")) {
        await sendEth(wallet, "0.01");
        console.log("Sent 0.01 ETH to the wallet for gas. The client would send it from any exchange.");
      }
      const hash = await phone.exitUsdc(to, amount);
      const [fromBalance, toBalance] = await Promise.all([usdcOf(wallet), usdcOf(to)]);
      console.log(
        table(
          [
            ["Transaction", hash],
            [name, usdc(fromBalance)],
            [toArg, usdc(toBalance)],
          ],
          "",
        ),
      );
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
