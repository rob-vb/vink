// API Keys: named secrets an Admin makes so a program can use the public API
// (/v1, see publicApi/). A key is shown once, at creation; only its SHA-256
// hash is stored. Revoking one deletes its row and ends its Subscriptions,
// and leaves the other keys alone.
import { ConvexError, v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { orgMutation, orgQuery } from "./lib/functions";
import { endSubscriptionsOf } from "./subscriptions";

export const KEY_PREFIX = "vink_live_";

// Base62, 40 characters: about 238 bits.
const ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const KEY_LENGTH = 40;

function newKey() {
  const chars: string[] = [];
  // Rejection sampling keeps every character equally likely.
  while (chars.length < KEY_LENGTH) {
    for (const byte of crypto.getRandomValues(new Uint8Array(KEY_LENGTH))) {
      if (byte < 248 && chars.length < KEY_LENGTH) chars.push(ALPHABET[byte % 62]);
    }
  }
  return KEY_PREFIX + chars.join("");
}

export async function hashKey(key: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export const list = orgQuery({
  role: "admin",
  args: {},
  handler: async (ctx) => {
    const keys = await ctx.db
      .query("apiKeys")
      .withIndex("by_organisationId", (q) => q.eq("organisationId", ctx.organisationId))
      .take(100);
    return keys.map((key) => ({
      id: key._id,
      name: key.name,
      hint: `${KEY_PREFIX}…${key.last4}`,
      createdAt: key._creationTime,
      lastUsedAt: key.lastUsedAt ?? null,
    }));
  },
});

/** Returns the key itself: the only time it leaves Vink. */
export const create = orgMutation({
  role: "admin",
  args: { name: v.string() },
  handler: async (ctx, { name }) => {
    if (name.trim() === "") throw new ConvexError("An API Key needs a name");
    const key = newKey();
    const apiKeyId = await ctx.db.insert("apiKeys", {
      organisationId: ctx.organisationId,
      name: name.trim(),
      keyHash: await hashKey(key),
      last4: key.slice(-4),
      createdBy: ctx.userId,
    });
    return { apiKeyId, key };
  },
});

export const revoke = orgMutation({
  role: "admin",
  args: { apiKeyId: v.id("apiKeys") },
  handler: async (ctx, { apiKeyId }) => {
    const key = await ctx.db.get(apiKeyId);
    if (key === null || key.organisationId !== ctx.organisationId) {
      throw new ConvexError("API Key not found");
    }
    await endSubscriptionsOf(ctx, apiKeyId);
    await ctx.db.delete(apiKeyId);
  },
});

/** The key behind a hash, for the public API's auth (publicApi/auth.ts). */
export const byHash = internalQuery({
  args: { keyHash: v.string() },
  handler: async (ctx, { keyHash }) => {
    const key = await ctx.db
      .query("apiKeys")
      .withIndex("by_keyHash", (q) => q.eq("keyHash", keyHash))
      .unique();
    return key && { apiKeyId: key._id, organisationId: key.organisationId, lastUsedAt: key.lastUsedAt ?? null };
  },
});

export const markUsed = internalMutation({
  args: { apiKeyId: v.id("apiKeys"), at: v.number() },
  handler: async (ctx, { apiKeyId, at }) => {
    // Revoked in the meantime: nothing to mark.
    if ((await ctx.db.get(apiKeyId)) === null) return;
    await ctx.db.patch(apiKeyId, { lastUsedAt: at });
  },
});
