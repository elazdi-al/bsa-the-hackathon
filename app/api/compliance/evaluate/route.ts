import { handleEvaluation } from "@/services/compliance/http";
import { getComplianceRuntime } from "@/services/compliance/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) { return handleEvaluation(request, getComplianceRuntime) }
