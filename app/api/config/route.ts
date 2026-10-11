import { route } from "@/lib/wallet/api/http.ts";
import { addresses, chain, plus } from "@/lib/wallet/env.ts";

export const dynamic = "force-dynamic";

/** What the phone needs to check and sign operations itself, and what Swissquote Plus costs and where it is paid. */
export const GET = route(async () =>
  Response.json({
    chainId: chain.id,
    entryPoint: addresses.entryPoint,
    usdc: addresses.usdc,
    plus: { to: addresses.swissquote, price: plus.price.toString(), period: plus.period },
  }),
);
