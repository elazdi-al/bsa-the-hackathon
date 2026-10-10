import type { Wallet } from "@/app/(tabs)/_components/wallet";

export type CoinId = "usdc" | "eth" | "eurc" | "cbbtc" | "aero";

/** The part of a holding that is locked up earning yield: staked ETH, stablecoins in Earn. */
export type Stake = {
  label: string;
  principalLabel: string;
  principal: number;
  earned: number;
};

export type Coin = {
  id: CoinId;
  name: string;
  symbol: string;
  amount: number;
  /** USD value of the whole holding. */
  value: number;
  /** 24h change in USD. Stablecoins have none. */
  change?: number;
  stake?: Stake;
};


export const coins: Coin[] = [
  {
    id: "usdc",
    name: "USD Coin",
    symbol: "USDC",
    amount: 10_000,
    value: 10_000,
    stake: { label: "Total in Earn", principalLabel: "Deposited", principal: 6_860, earned: 140 },
  },
  {
    id: "eth",
    name: "Ethereum",
    symbol: "ETH",
    amount: 2.2,
    value: 5_500,
    change: 162,
    stake: { label: "Total Staked", principalLabel: "Staked", principal: 0.6, earned: 0.0128 },
  },
  {
    id: "eurc",
    name: "Euro Coin",
    symbol: "EURC",
    amount: 4_300,
    value: 4_988,
    stake: { label: "Total in Earn", principalLabel: "Deposited", principal: 2_560, earned: 26.4 },
  },
  { id: "cbbtc", name: "Coinbase Wrapped BTC", symbol: "cbBTC", amount: 0.01706, value: 1_450, change: 21 },
  { id: "aero", name: "Aerodrome", symbol: "AERO", amount: 1_291, value: 581, change: -9 },
];

export const stakedTotal = (coin: Coin) => (coin.stake ? coin.stake.principal + coin.stake.earned : 0);
export const availableShare = (coin: Coin) => 1 - stakedTotal(coin) / coin.amount;

/**
 * The demo portfolio with the live wallet in it: USDC outside Earn is the wallet's USDC, and where there is a pool,
 * ETH outside staking is its WETH, all of it valued at the pool's price. The rest stays demo data.
 */
export function portfolio(wallet?: Pick<Wallet, "usdc" | "eth" | "ethPrice">): Coin[] {
  if (!wallet) return coins;
  const { usdc, eth, ethPrice } = wallet;
  return coins.map((coin) => {
    if (coin.id === "usdc") {
      const amount = usdc + stakedTotal(coin);
      return { ...coin, amount, value: amount };
    }
    if (coin.id === "eth" && ethPrice !== null) {
      const amount = eth + stakedTotal(coin);
      const value = amount * ethPrice;
      // The demo 24h change scales with the value, so its percent holds.
      return { ...coin, amount, value, change: ((coin.change ?? 0) * value) / coin.value };
    }
    return coin;
  });
}

/** What Home's Investments tile holds: everything but the stablecoins. */
export const investmentsValue = (coins: Coin[]) =>
  coins.filter((c) => c.id === "eth" || c.id === "cbbtc" || c.id === "aero").reduce((sum, c) => sum + c.value, 0);
