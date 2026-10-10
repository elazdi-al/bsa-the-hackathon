import { addresses, chain, partnerUrl } from "@/lib/wallet/env.ts";

export const dynamic = "force-dynamic";

/** What the phone needs to check and sign operations itself, and where to send Share C. */
export function GET() {
  return Response.json({ chainId: chain.id, entryPoint: addresses.entryPoint, usdc: addresses.usdc, partnerUrl });
}
