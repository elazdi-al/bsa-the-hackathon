import { addresses, chain } from "@/lib/wallet/env.ts";

export const dynamic = "force-dynamic";

/** What the phone needs to check and sign operations itself. */
export function GET() {
  return Response.json({ chainId: chain.id, entryPoint: addresses.entryPoint, usdc: addresses.usdc });
}
