import { appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname } from "node:path";
import { canonicalJson, hashPayload } from "../../lib/compliance/canonical";
import type { AuditSink, SignedDecision } from "../../lib/compliance/types";

export interface AuditRecord { sequence: number; previousHash: string; receipt: SignedDecision; hash: string }
const genesis = "0x" + "0".repeat(64);
export function verifyAuditRecords(records: AuditRecord[]): boolean {
  let previous = genesis;
  return records.every((record, index) => {
    const { hash, ...content } = record;
    if (content.sequence !== index + 1 || content.previousHash !== previous || hash !== hashPayload("swissquote-compliance/audit/v1", content)) return false;
    previous = hash;
    return true;
  });
}
export class MemoryAuditSink implements AuditSink {
  readonly records: AuditRecord[] = [];
  async append(receipt: SignedDecision) {
    const content = { sequence: this.records.length + 1, previousHash: this.records.at(-1)?.hash ?? genesis, receipt };
    this.records.push(JSON.parse(canonicalJson({ ...content, hash: hashPayload("swissquote-compliance/audit/v1", content) })));
  }
}
/** Single-process demo sink. Production needs transactional shared storage and external hash anchors. */
export class FileAuditSink implements AuditSink {
  private previousHash = genesis;
  private sequence = 0;
  private queue: Promise<void>;
  constructor(private readonly path: string) {
    this.queue = this.restore();
    void this.queue.catch(() => undefined); // retain rejection for append, but handle eager startup rejection
  }
  private async restore() {
    await mkdir(dirname(this.path), { recursive: true });
    let content: string;
    try { content = await readFile(this.path, "utf8") }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return; throw error }
    const records = content.split("\n").filter(Boolean).map((line) => JSON.parse(line) as AuditRecord);
    if (!verifyAuditRecords(records)) throw new Error("Audit hash chain failed validation");
    this.sequence = records.length;
    this.previousHash = records.at(-1)?.hash ?? genesis;
  }
  async append(receipt: SignedDecision) {
    const operation = this.queue.then(async () => {
      const content = { sequence: this.sequence + 1, previousHash: this.previousHash, receipt };
      const hash = hashPayload("swissquote-compliance/audit/v1", content);
      await appendFile(this.path, canonicalJson({ ...content, hash }) + "\n", { encoding: "utf8", mode: 0o600 });
      this.sequence = content.sequence;
      this.previousHash = hash;
    });
    // An audit failure poisons this process: restart after repairing storage; no silent approvals.
    this.queue = operation;
    await operation;
  }
}
