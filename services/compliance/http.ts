import { timingSafeEqual } from "node:crypto";
import { ZodError } from "zod";
import { hashPayload } from "../../lib/compliance/canonical";
import type { ComplianceRuntime } from "./runtime";

export class HttpError extends Error { constructor(readonly status: number, readonly code: string) { super(code) } }
const noStore = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
const maxBodyBytes = 128 * 1024;

type ServiceEnvironment = Record<string, string | undefined>;
export function authenticate(request: Request, env: ServiceEnvironment = process.env): string {
  const secret = env.COMPLIANCE_API_KEY;
  if (!secret) throw new HttpError(503, "COMPLIANCE_API_KEY_NOT_CONFIGURED");
  const provided = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const actualBytes = Buffer.from(provided);
  const expectedBytes = Buffer.from(expected);
  if (actualBytes.length !== expectedBytes.length || !timingSafeEqual(actualBytes, expectedBytes)) throw new HttpError(401, "UNAUTHORIZED");
  const subject = request.headers.get("x-compliance-subject");
  if (!subject || subject.length > 128 || !/^[a-zA-Z0-9._:@-]+$/.test(subject)) throw new HttpError(400, "TRUSTED_SUBJECT_REQUIRED");
  return subject;
}

async function readJson(request: Request): Promise<unknown> {
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") throw new HttpError(415, "JSON_REQUIRED");
  if (!request.body) throw new HttpError(400, "EMPTY_BODY");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBodyBytes) { await reader.cancel(); throw new HttpError(413, "BODY_TOO_LARGE") }
    chunks.push(value);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")) }
  catch { throw new HttpError(400, "INVALID_JSON") }
}

export async function handleEvaluation(request: Request, runtime: () => ComplianceRuntime, env: ServiceEnvironment = process.env): Promise<Response> {
  try {
    const subject = authenticate(request, env);
    const input = await readJson(request);
    const receipt = await runtime().engine.evaluate(input, { subject });
    return Response.json(receipt, { headers: noStore });
  } catch (error) { return errorResponse(error) }
}
export function handleKeys(request: Request, runtime: () => ComplianceRuntime, env: ServiceEnvironment = process.env): Response {
  try {
    authenticate(request, env);
    const { signer, mode } = runtime();
    return Response.json({ algorithm: "Ed25519", keyId: signer.keyId, publicKeyPem: signer.publicKeyPem, mode }, { headers: noStore });
  } catch (error) { return errorResponse(error) }
}
export function handleRegistry(request: Request, runtime: () => ComplianceRuntime, env: ServiceEnvironment = process.env): Response {
  try {
    authenticate(request, env);
    const { engine, mode } = runtime();
    return Response.json({ mode, policyHash: hashPayload("swissquote-compliance/policy/v1", engine.policy), policy: engine.policy }, { headers: noStore });
  } catch (error) { return errorResponse(error) }
}
export function errorResponse(error: unknown): Response {
  if (error instanceof HttpError) return Response.json({ error: error.code }, { status: error.status, headers: noStore });
  if (error instanceof ZodError) return Response.json({ error: "INVALID_REQUEST", issues: error.issues.map((issue) => ({ path: issue.path, message: issue.message })) }, { status: 400, headers: noStore });
  return Response.json({ error: "COMPLIANCE_SERVICE_UNAVAILABLE" }, { status: 503, headers: noStore });
}
