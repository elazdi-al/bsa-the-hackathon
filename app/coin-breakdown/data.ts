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

export const wallet = {
  name: "Wallet",
  address: "0x82f1cE804bd5AdcAcB5AFB460d8C1Db330a259e7",
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
