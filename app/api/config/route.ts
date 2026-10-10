import { route } from "@/lib/wallet/api/http.ts";
import { addresses, chain } from "@/lib/wallet/env.ts";

export const dynamic = "force-dynamic";

/** What the phone needs to check and sign operations itself. `weth` and `pool` are null on a chain without a swap pool. */
export const GET = route(async () =>
  Response.json({ chainId: chain.id, entryPoint: addresses.entryPoint, usdc: addresses.usdc, weth: addresses.weth, pool: addresses.pool }),
);
