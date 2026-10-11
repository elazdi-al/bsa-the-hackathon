import { route } from "@/lib/wallet/api/http";
import { getDappCatalog } from "@/services/dapps/wallet";

// Browser-safe facade. The authenticated /api/compliance API remains backend-only.
export const GET = route(async () => Response.json(await getDappCatalog(), { headers: { "cache-control": "no-store" } }));
