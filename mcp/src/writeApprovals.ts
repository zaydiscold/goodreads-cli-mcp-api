import { createHash } from "node:crypto";

function canonical(value: string | undefined): string {
  return value?.trim().replace(/\s+/g, " ") ?? "";
}

export function quotePayloadSha256(options: {
  body: string;
  author: string;
  title?: string;
  tags?: string;
}): string {
  const payload = JSON.stringify({
    body: canonical(options.body),
    author: canonical(options.author),
    title: canonical(options.title),
    tags: canonical(options.tags),
  });
  return createHash("sha256").update(payload, "utf8").digest("hex");
}

export function requireExactApproval(
  label: string,
  actual: string,
  approved: string | undefined,
): void {
  if (!approved?.trim()) throw new Error(`${label} is required for execute`);
  if (approved.trim() !== actual) throw new Error(`${label} mismatch`);
}

export function requireApprovedBook(bookId: string, approvedBookId: string[] | undefined): void {
  if (!approvedBookId?.includes(bookId)) {
    throw new Error("approvedBookId must include the exact bookId for execute");
  }
}
