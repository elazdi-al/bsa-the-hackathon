// The protocol from a terminal, against npm run local. Each account is a phone simulated in Node,
// saved in data/accounts/<name>.json with its passkey, Recovery Key and device record.
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
  parseUnits,
  recoverMessageAddress,
  type Address,
  type Hex,
} from "viem";
import { entryPoint07Abi } from "viem/account-abstraction";
import { generatePrivateKey, privateKeyToAddress } from "viem/accounts";
import { foundry } from "viem/chains";
import { ownershipMessage } from "../lib/wallet/account.ts";
import { addresses, chain, credentials, partnerUrl, pendingRecovery, publicClient } from "../lib/wallet/env.ts";
import { ApiError, readRecoveryKey, RECOVERY_FILE, type Device, type Identity, type SignedIn, type WalletState } from "../lib/wallet/phone.ts";
import { setSunset } from "../lib/wallet/sunset.ts";
import { attack } from "./attack.ts";
import { APP, mintUsdc, newPhone, sendEth } from "./software-phone.ts";

/** `signedIn`: the Swissquote client the account's phone is signed in as (mocked), with the number of their ID card. */
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
  return { name, file, recoveryKey: account.recoveryKey, signedIn: account.signedIn, phone: accountPhone(file, account) };
}

/** The owner's ID card. The software phone plays the owner, who holds the card, so the account file keeps its mock number. */
function identityOf({ name, signedIn }: ReturnType<typeof loadAccount>): Identity {
  if (!signedIn?.client.document) throw new Error(`${name} has no ID on file: it was made before Swissquote showed clients their ID card.`);
  return { document: signedIn.client.document };
}

function walletOf(arg: string): Address {
  if (isAddress(arg)) return arg;
  const address = loadAccount(arg).phone.device()?.address;
  if (!address) throw new Error(`${arg} has no wallet.`);
  return address;
}

/** Swissquote locks or unlocks the live credentials of an account's wallet, after the owner's mocked ID check. */
async function setLock(name: string, method: "POST" | "DELETE") {
  // The owner shows their ID card to Swissquote's hotline; the demo sends its number.
  const identity = identityOf(loadAccount(name));
  const res = await fetch(`${APP}/api/wallets/${walletOf(name)}/lock`, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ identity }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, json);
  return json as { wallet: Address; signer: Address };
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

// Swissquote's own view: each wallet's owner from its client records, which only the bank sees.
const walletRows = () =>
  query<{ address: Address; config: string; client: string | null; signature: Hex | null; kyc: string | null }>(
    `select address, config, owners.client, owners.signature, clients.kyc from wallets
     left join owners on owners.wallet = wallets.address left join clients on clients.number = owners.client
     order by wallets.created_at`,
  );

/** Who owns the wallet, and whether the key the wallet was created with signed the ownership statement Swissquote keeps. */
async function ownerLine(wallet: Address, signer: Address, client: string, signature: Hex, kyc: string | null) {
  const by = await recoverMessageAddress({ message: ownershipMessage(client, wallet), signature });
  const name = kyc ? `${JSON.parse(kyc).name}, ` : "";
  const proof = isAddressEqual(by, signer) ? "ownership signed by the wallet key" : "OWNERSHIP SIGNATURE DOES NOT MATCH THE WALLET KEY";
  return `owner: ${name}Swissquote client ${client} (mock), ${proof}`;
}

/** Swissquote reads the wallet as the app does, which sends its held payments that are due. */
const heldOf = async (wallet: Address) => ((await (await fetch(`${APP}/api/wallets/${wallet}`)).json()) as WalletState).held;

function usdcAmount(text: string) {
  if (!/^\d+(\.\d{1,6})?$/.test(text)) throw new Error(`${text} is not a USDC amount, like 25 or 0.5.`);
}

const usdcOf = (owner: Address) => publicClient.readContract({ address: addresses.usdc, abi: erc20Abi, functionName: "balanceOf", args: [owner] });
const usdc = (amount: bigint) => `${Number(formatUnits(amount, 6)).toFixed(2)} USDC`;
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
          rows.map(async ({ address, config, client, signature, kyc }) => {
            const [balance, code, live, pending, owner] = await Promise.all([
              usdcOf(address),
              publicClient.getCode({ address }),
              credentials(address, () => JSON.parse(config)),
              pendingRecovery(address),
              client && signature && ownerLine(address, JSON.parse(config).signer, client, signature, kyc),
            ]);
            return { address, balance, deployed: !!code, signer: live.signer, pendingRecovery: pending, owner };
          }),
        ),
      ]);
      const eth = (wei: bigint) => `${Number(formatEther(wei)).toFixed(4)} ETH`;
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
        console.log(`    ${wallet.owner ?? "no owner record: made before Swissquote linked wallets to clients"}`);
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
    usage: "fund [wallet] [amount=100]",
    about: "Mint test USDC to an account or address, by default the newest wallet.",
    async run([target, amount = "100"]) {
      usdcAmount(amount);
      const to = target ? walletOf(target) : walletRows().at(-1)?.address;
      if (!to) throw new Error("No wallets yet. Create one in the browser or with npm run account <name>.");
      await mintUsdc(to, amount);
      console.log(
        table(
          [
            ["Wallet", to],
            ["Balance", usdc(await usdcOf(to))],
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
      account.signedIn = await phone.signIn();
      await phone.splitKey(await phone.createPasskey());
      const wallet = await phone.register(privateKeyToAddress(account.recoveryKey), account.signedIn);
      const keyFile = `${ACCOUNTS}/${name} Recovery Key.txt`;
      writeFileSync(keyFile, RECOVERY_FILE.text(account.recoveryKey));
      await mintUsdc(wallet, "100");
      console.log(
        table(
          [
            ["Wallet", wallet],
            ["Client", `${account.signedIn.client.name}, Swissquote client ${account.signedIn.client.number} (mock)`],
            ["Account", file],
            ["Recovery Key", keyFile],
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
      if ("releaseAt" in sent) {
        const { time } = await chainClock();
        console.log(`Over 1,000 USDC, so Swissquote holds it for 24 hours. ${fromName} can cancel it until then.`);
        console.log(
          table(
            [
              ["Held", `${usdc(parseUnits(amount, 6))} to ${toArg}`],
              ["Leaves", `${when(sent.releaseAt)}, in ${duration(sent.releaseAt - time)}`],
              ["Payment", sent.hash],
              ["To release", "npm run warp 24"],
              ["To cancel", `npm run cancel-payment ${fromName}`],
            ],
            "",
          ),
        );
        return;
      }
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
    usage: "recover <account | Recovery Key file> [new-name] [ID number]",
    about: "Start a recovery onto a new software phone with the Recovery Key and the owner's ID card number. It can finish after 48 hours.",
    async run([source, target, idNumber]) {
      const owner = NAME.test(source) && existsSync(accountFile(source)) ? loadAccount(source) : undefined;
      if (!owner && !existsSync(source)) throw new Error(`No account or Recovery Key file "${source}".`);
      const secret = owner ? owner.recoveryKey : readRecoveryKey(readFileSync(source, "utf8"));
      if (!secret) throw new Error(`${source} holds no recovery key.`);
      // An account keeps its owner's mock ID card; a Recovery Key file comes with the number the owner reads off theirs.
      if (!owner && !idNumber) throw new Error(`Add the number on the owner's ID card, shown in Settings: npm run recover ${source} ${target ?? "recovered"} <ID number>`);
      const identity = owner ? identityOf(owner) : { document: idNumber! };
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
      if (!(await phone.findRecovery(secret)).linked) throw new Error("That wallet isn't linked to a Swissquote client, so its ID check can't pass.");
      await phone.splitKey(await phone.createPasskey());
      const { address, executeAfter, signedIn } = await phone.startRecovery(secret, identity);
      account.signedIn = signedIn;
      writeFileSync(file, JSON.stringify(account, null, 2));
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

  attack: {
    usage: "attack <account>",
    about: "An attacker with the account's phone and email inbox tries to take its wallet, with Face ID once the phone is reported stolen, then with the Recovery Key and a forged ID. Every attempt must fail.",
    async run([name]) {
      const account = loadAccount(name);
      const { phone, recoveryKey } = account;
      const device = phone.device();
      if (!device?.address) throw new Error(`${name} has no wallet.`);
      const { pendingRecovery, locked } = await phone.state();
      if (pendingRecovery) throw new Error(`A recovery is pending for ${name}'s wallet. Cancel it first: npm run cancel ${name}.`);
      if (locked) throw new Error(`Swissquote has locked ${name}'s phone. Unlock it first: npm run unlock ${name}.`);
      await attack({ phone: structuredClone(device), homeKey: recoveryKey, unlocked: phone, ownersId: identityOf(account) });
      console.log(`Every attempt on ${name}'s wallet failed.`);
    },
  },

  lock: {
    usage: "lock <account>",
    about: "Report an account's phone lost: Swissquote locks its credentials, after a mocked ID check.",
    async run([name]) {
      const { wallet, signer } = await setLock(name, "POST");
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
    about: "Swissquote unlocks the phone, after a mocked ID check.",
    async run([name]) {
      const { wallet, signer } = await setLock(name, "DELETE");
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

  "cancel-payment": {
    usage: "cancel-payment <account> [payment]",
    about: "Cancel an account's held payments, or one of them, through Swissquote, signed with the Recovery Key.",
    async run([name, hash]) {
      const { phone, recoveryKey } = loadAccount(name);
      const payments = (await phone.state()).held.filter((p) => !hash || p.hash === hash);
      if (!payments.length) throw new Error(hash ? `${name} has no held payment ${hash}.` : `${name} has no held payments.`);
      for (const payment of payments) await phone.cancelPaymentWithSwissquote(recoveryKey, payment.hash);
      console.log(table(payments.map((p) => ["Cancelled", `${usdc(BigInt(p.value))} to ${p.to}`, p.hash]), ""));
    },
  },

  warp: {
    usage: "warp [hours=48]",
    about: "Move chain time ahead, so a pending recovery can finish and held payments that are due leave.",
    async run([hours = "48"]) {
      const seconds = Math.round(Number(hours) * 3600);
      if (!Number.isFinite(seconds) || seconds <= 0) throw new Error(`${hours} is not a number of hours, like 48.`);
      if (chain.id !== foundry.id) throw new Error("warp only works on the local anvil chain.");
      const wallets = query<{ wallet: Address }>("select distinct wallet from held where stopped is null").map((row) => row.wallet);
      const before = (await Promise.all(wallets.map(heldOf))).flat().filter((p) => !p.stopped);
      await publicClient.request({ method: "evm_increaseTime", params: [numberToHex(seconds)] } as never);
      await publicClient.request({ method: "evm_mine", params: [] } as never);
      const { time } = await chainClock();
      console.log(`Chain time is now ${when(time)}, ${drift(time)}.`);
      const after = new Map((await Promise.all(wallets.map(heldOf))).flat().map((p) => [p.hash, p]));
      const rows = before.map((p) => {
        const now = after.get(p.hash);
        const payment = `${usdc(BigInt(p.value))} to ${p.to}`;
        if (!now) return ["Released", payment];
        if (now.stopped) return ["Stopped", payment, now.stopped];
        return ["Held", payment, `leaves in ${duration(now.releaseAt - time)}`];
      });
      if (rows.length) console.log(table(rows, ""));
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
