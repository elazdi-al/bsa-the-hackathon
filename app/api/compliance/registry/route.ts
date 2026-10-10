import { handleRegistry } from "@/services/compliance/http";
import { getComplianceRuntime } from "@/services/compliance/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) { return handleRegistry(request, getComplianceRuntime) }
