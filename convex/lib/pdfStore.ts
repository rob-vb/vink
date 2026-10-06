// The adapter boundary to Cloudflare R2 (EU jurisdiction), where Documents'
// PDFs live. Tests replace this module with a fake (see test.setup.ts).
import { R2 } from "@convex-dev/r2";
import { components } from "../_generated/api";
import type { ActionCtx, MutationCtx } from "../_generated/server";

const r2 = new R2(components.r2);

export const pdfStore = {
  /** A URL the browser PUTs the PDF to, under a key the server chose. */
  async uploadUrl(key: string): Promise<string> {
    return (await r2.generateUploadUrl(key)).url;
  },

  /** Stores bytes the server received itself (the public API), under `key`. */
  async store(ctx: ActionCtx, key: string, bytes: Uint8Array): Promise<void> {
    await r2.store(ctx, bytes, { key, type: "application/pdf" });
  },

  /** The stored bytes, or `null` if nothing was uploaded under `key`. */
  async read(key: string): Promise<Uint8Array | null> {
    const response = await fetch(await r2.getUrl(key));
    if (!response.ok) return null;
    return new Uint8Array(await response.arrayBuffer());
  },

  async remove(ctx: MutationCtx | ActionCtx, key: string): Promise<void> {
    await r2.deleteObject(ctx, key);
  },

  /** A signed URL that opens the PDF until it expires. */
  async viewUrl(key: string, expiresInSeconds: number): Promise<string> {
    return await r2.getUrl(key, { expiresIn: expiresInSeconds });
  },
};

export type PdfStore = typeof pdfStore;
