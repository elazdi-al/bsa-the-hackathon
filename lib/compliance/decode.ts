import { decodeFunctionData, encodeFunctionData, formatUnits as viemFormatUnits, maxUint256, parseAbi, toFunctionSelector, zeroAddress, type Address } from "viem";

/** A token amount for the client to read: exact, with thousands separators. */
const formatUnits = (value: bigint, decimals: number) => viemFormatUnits(value, decimals).replace(/^\d+/, (whole) => whole.replace(/\B(?=(\d{3})+$)/g, ","));
import type { CompliancePolicy, ComplianceRequest, DecodedAction, Finding } from "./types";

export const erc20Abi = parseAbi([
  "function transfer(address to, uint256 amount) returns (bool)",
  "function approve(address spender, uint256 amount) returns (bool)",
]);
export const vaultAbi = parseAbi([
  "function deposit(uint256 assets, address receiver) returns (uint256 shares)",
  "function withdraw(uint256 assets, address receiver, address owner) returns (uint256 shares)",
  "function redeem(uint256 shares, address receiver, address owner) returns (uint256 assets)",
]);
const adminSelectors = new Set<string>([
  "addOwnerWithThreshold(address,uint256)", "removeOwner(address,address,uint256)",
  "swapOwner(address,address,address)", "changeThreshold(uint256)", "enableModule(address)",
  "disableModule(address,address)", "setGuard(address)", "setModuleGuard(address)",
  "setFallbackHandler(address)", "upgradeTo(address)", "upgradeToAndCall(address,bytes)",
].map((signature) => toFunctionSelector(signature)));
const nftApprovalSelector = toFunctionSelector("setApprovalForAll(address,bool)");
const address = (value: unknown) => String(value).toLowerCase() as Address;

export function findToken(policy: CompliancePolicy, chainId: number, token: string) {
  return policy.tokens.find((item) => item.chainId === chainId && item.address === token);
}

export function decodeRequest(request: ComplianceRequest, policy: CompliancePolicy) {
  const actions: DecodedAction[] = [];
  const findings: Finding[] = [];
  const fail = (index: number, code: string, message: string) => findings.push({ callIndex: index, code, message, status: "DENY_ASSISTANCE" });
  request.calls.forEach((call, index) => {
    const selector = call.data.slice(0, 10);
    if (call.operation === "DELEGATECALL") return fail(index, "DELEGATECALL_DENIED", "This app asks for full control of your wallet. Swissquote doesn't allow that.");
    if (call.to === request.account || adminSelectors.has(selector)) {
      return fail(index, "ACCOUNT_ADMIN_DENIED", "Your wallet's security can only be changed in Settings or through recovery.");
    }
    if (selector === nftApprovalSelector) return fail(index, "OPERATOR_APPROVAL_DENIED", "This app asks to control all your NFTs. Swissquote doesn't allow that.");
    if (call.data === "0x") {
      const native = policy.nativeTransfers.find((item) => item.chainId === request.chainId);
      if (!native || BigInt(call.value) === 0n) return fail(index, "NATIVE_TRANSFER_DENIED", "Swissquote doesn't support sending this network's own coin.");
      if (request.dapp) return fail(index, "DAPP_NATIVE_TRANSFER_DENIED", "Swissquote doesn't let apps send this network's own coin.");
      actions.push({ callIndex: index, type: "NATIVE_TRANSFER", contract: call.to, functionName: "nativeTransfer", addresses: [call.to],
        amount: call.value, debit: { asset: "native", amount: call.value }, recipient: call.to,
        summary: `Send ${formatUnits(BigInt(call.value), 18)} native tokens to ${call.to}.` });
      return;
    }
    const contract = policy.contracts.find((item) => item.chainId === request.chainId && item.address === call.to);
    if (!contract) return fail(index, "CONTRACT_NOT_APPROVED", "Swissquote hasn't reviewed the service this payment uses.");
    if (request.dapp && !contract.origins.includes(request.dapp.origin)) return fail(index, "DAPP_ORIGIN_NOT_APPROVED", "Swissquote hasn't approved this website for this service.");
    if (BigInt(call.value) !== 0n) return fail(index, "UNEXPECTED_NATIVE_VALUE", "This payment includes a coin this service doesn't accept.");
    try {
      const abi = contract.kind === "ERC20" ? erc20Abi : vaultAbi;
      const decoded = decodeFunctionData({ abi, data: call.data });
      const encoded = encodeFunctionData({ abi, functionName: decoded.functionName, args: decoded.args } as Parameters<typeof encodeFunctionData>[0]);
      if (encoded.toLowerCase() !== call.data) return fail(index, "NONCANONICAL_CALLDATA", "This payment contains extra data Swissquote can't check.");
      if (!contract.allowedFunctions.includes(decoded.functionName)) return fail(index, "FUNCTION_NOT_APPROVED", "This app asks for something Swissquote doesn't support.");
      const args = decoded.args as readonly unknown[];
      if (contract.kind === "ERC20") {
        const token = findToken(policy, request.chainId, call.to)!;
        const target = address(args[0]);
        const amount = String(args[1]);
        const displayed = formatUnits(BigInt(amount), token.decimals);
        if (decoded.functionName === "approve") {
          if (BigInt(amount) === maxUint256) return fail(index, "UNLIMITED_APPROVAL", "Swissquote doesn't allow unlimited spending permission. Set a specific amount and try again.");
          if (BigInt(amount) !== 0n && !token.approvedSpenders.includes(target)) return fail(index, "SPENDER_NOT_APPROVED", "Swissquote hasn't reviewed the app asking to spend from your wallet.");
          actions.push({ callIndex: index, type: "APPROVAL", contract: call.to, functionName: "approve", addresses: [call.to, target], spender: target, amount,
            approval: { token: call.to, spender: target, amount }, summary: `Set ${target}'s spending permission to ${displayed} ${token.symbol}.` });
        } else {
          if (target === zeroAddress) return fail(index, "ZERO_RECIPIENT", "This address can't receive payments. Money sent there is lost.");
          actions.push({ callIndex: index, type: "TRANSFER", contract: call.to, functionName: "transfer", addresses: [call.to, target], recipient: target, amount,
            debit: target === request.account ? undefined : { asset: call.to, amount }, summary: `Send ${displayed} ${token.symbol} to ${target}.` });
        }
        return;
      }
      const receiver = address(args[1]);
      const amount = String(args[0]);
      const asset = contract.asset!;
      const share = contract.shareToken!;
      if (decoded.functionName === "deposit") {
        if (receiver !== request.account) return fail(index, "VAULT_RECEIVER_MISMATCH", "This deposit would be credited to another wallet, not yours.");
        const token = findToken(policy, request.chainId, asset)!;
        actions.push({ callIndex: index, type: "DEPOSIT", contract: call.to, functionName: "deposit", addresses: [call.to, receiver, asset], amount,
          debit: { asset, amount }, creditAsset: share, recipient: receiver, summary: `Deposit ${formatUnits(BigInt(amount), token.decimals)} ${token.symbol} into ${contract.name}; receive vault shares.` });
      } else {
        const owner = address(args[2]);
        if (owner !== request.account) return fail(index, "VAULT_OWNER_MISMATCH", "You can only withdraw from your own deposits.");
        const token = findToken(policy, request.chainId, decoded.functionName === "redeem" ? share : asset)!;
        actions.push({ callIndex: index, type: decoded.functionName === "redeem" ? "REDEEM" : "WITHDRAW", contract: call.to,
          functionName: decoded.functionName, addresses: [call.to, receiver, owner, asset], amount, recipient: receiver,
          debit: decoded.functionName === "redeem" ? { asset: share, amount } : undefined,
          creditAsset: receiver === request.account ? asset : undefined,
          summary: `${decoded.functionName === "redeem" ? "Redeem" : "Withdraw"} ${formatUnits(BigInt(amount), token.decimals)} ${token.symbol} from ${contract.name} to ${receiver}.` });
      }
    } catch { fail(index, "CALLDATA_NOT_SUPPORTED", "Swissquote can't read what this app is asking for."); }
  });
  return { actions, findings };
}
