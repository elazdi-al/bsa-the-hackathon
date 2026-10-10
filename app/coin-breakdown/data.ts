export type CoinId = "sol" | "usdc" | "pyusd" | "jto" | "jup" | "tnsr";

/** The part of a holding that is locked up earning yield: staked SOL, stablecoins in Earn. */
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

export const wallet = {
  name: "Wallet",
  address: "7k4rM9pVb2hXqLwT8sNcYd5fJ3eGaZ1uRkH6tB23et",
};

export const coins: Coin[] = [
  {
    id: "sol",
    name: "Solana",
    symbol: "SOL",
    amount: 80.06,
    value: 10_400,
    change: 513,
    stake: { label: "Total Staked", principalLabel: "Staked", principal: 25, earned: 5 },
  },
  {
    id: "usdc",
    name: "USD Coin",
    symbol: "USDC",
    amount: 6_000,
    value: 6_000,
    stake: { label: "Total in Earn", principalLabel: "Deposited", principal: 3_520, earned: 80 },
  },
  {
    id: "pyusd",
    name: "PayPal USD",
    symbol: "PYUSD",
    amount: 3_000,
    value: 3_000,
    stake: { label: "Total in Earn", principalLabel: "Deposited", principal: 352.5, earned: 7.5 },
  },
  { id: "jto", name: "Jito", symbol: "JTO", amount: 575.04, value: 1_100, change: 14 },
  { id: "jup", name: "Jupiter", symbol: "JUP", amount: 1_420.01, value: 994, change: 12 },
  { id: "tnsr", name: "Tensor", symbol: "TNSR", amount: 3_200, value: 992, change: -2 },
];

export const stakedTotal = (coin: Coin) => (coin.stake ? coin.stake.principal + coin.stake.earned : 0);
export const availableShare = (coin: Coin) => 1 - stakedTotal(coin) / coin.amount;
