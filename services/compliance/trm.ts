import { z } from "zod";
import type { Address } from "viem";
import { addressSchema } from "../../lib/compliance/schema";
import type { ScreeningProvider, ScreeningResult } from "../../lib/compliance/types";

const resultSchema = z.array(z.object({ address: addressSchema, isSanctioned: z.boolean() }));
export interface TrmOptions {
  apiKey?: string;
  fetch?: typeof fetch;
  now?: () => Date;
  timeoutMs?: number;
  intervalMs?: number;
}

/** TRM's address-only sanctions endpoint. This does not provide KYT or SECO list certification. */
export class TrmScreeningProvider implements ScreeningProvider {
  private queue = Promise.resolve();
  private nextRequestAt = 0;
  constructor(private readonly options: TrmOptions = {}) {}
  async screen(addresses: Address[], _chainId?: number): Promise<ScreeningResult[]> {
    const unique = [...new Set(addresses.map((address) => address.toLowerCase() as Address))];
    if (!unique.length) return [];
    const operation = this.queue.then(async () => {
      const wait = Math.max(0, this.nextRequestAt - Date.now());
      if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
      this.nextRequestAt = Date.now() + (this.options.intervalMs ?? 1100);
      const checkedAt = (this.options.now?.() ?? new Date()).toISOString();
      const unavailable = (): ScreeningResult[] => unique.map((address) => ({ address, status: "UNAVAILABLE", checkedAt,
        provider: "trm-sanctions-api", mode: "live", coverage: ["TRM_SANCTIONS_API"] }));
      try {
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (this.options.apiKey) headers.Authorization = `Basic ${Buffer.from(`${this.options.apiKey}:${this.options.apiKey}`).toString("base64")}`;
        const response = await (this.options.fetch ?? fetch)("https://api.trmlabs.com/public/v1/sanctions/screening", {
          method: "POST", headers, body: JSON.stringify(unique.map((address) => ({ address }))),
          signal: AbortSignal.timeout(this.options.timeoutMs ?? 8000), redirect: "error",
        });
        if (!response.ok) return unavailable();
        const parsed = resultSchema.parse(await response.json());
        // Missing/duplicate/unrequested address evidence must not silently become CLEAR.
        if (parsed.some((item) => !unique.includes(item.address)) || new Set(parsed.map((item) => item.address)).size !== parsed.length) return unavailable();
        return unique.map((address): ScreeningResult => {
          const record = parsed.find((item) => item.address === address);
          return { address, status: record ? record.isSanctioned ? "MATCH" : "CLEAR" : "UNAVAILABLE", checkedAt,
            provider: "trm-sanctions-api", mode: "live", coverage: ["TRM_SANCTIONS_API"] };
        });
      } catch { return unavailable() }
    });
    this.queue = operation.then(() => undefined, () => undefined);
    return operation;
  }
}
