import { payloadTooLarge } from "@/lib/errors";

/**
 * Shared byte cap for admin JSON writes (architecture §11.4).
 * `contentMd` is limited to 200 KiB *characters*; CJK UTF-8 JSON can be ~3×
 * that plus the envelope. 1 MiB is above a legal max article and is not unlimited.
 */
export const MAX_ADMIN_JSON_BODY_BYTES = 1_048_576;

function concatChunks(chunks: Uint8Array[], total: number): Uint8Array {
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

async function readBodyWithLimit(request: Request, limit: number): Promise<Uint8Array> {
  const body = request.body;
  if (!body) return new Uint8Array();

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > limit) {
        await reader.cancel().catch(() => undefined);
        throw payloadTooLarge();
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return concatChunks(chunks, total);
}

/**
 * Read a JSON body for `/api/v1/admin/*` POST/PATCH. Call after
 * `assertSameOriginJson`. GET/DELETE must not use this helper.
 *
 * Failure order: Content-Length over cap → 413; actual bytes over cap → 413;
 * illegal JSON → SyntaxError (mapped to 400 by handleApiError).
 */
export async function readAdminJsonBody(request: Request): Promise<unknown> {
  const contentLength = request.headers.get("content-length");
  if (contentLength) {
    const n = Number.parseInt(contentLength, 10);
    if (Number.isFinite(n) && n > MAX_ADMIN_JSON_BODY_BYTES) {
      throw payloadTooLarge();
    }
  }

  const bytes = await readBodyWithLimit(request, MAX_ADMIN_JSON_BODY_BYTES);
  const text = new TextDecoder().decode(bytes);
  return JSON.parse(text) as unknown;
}
