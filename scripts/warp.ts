// Moves the local chain 48 hours ahead, so a pending recovery can be finalized in a demo.
//
//   npm run warp
import { numberToHex } from "viem";
import { publicClient } from "../lib/wallet/env.ts";

await publicClient.request({ method: "evm_increaseTime", params: [numberToHex(48 * 3600)] } as never);
await publicClient.request({ method: "evm_mine", params: [] } as never);
console.log(`Chain time is now ${new Date(Number((await publicClient.getBlock()).timestamp) * 1000).toISOString()}.`);
