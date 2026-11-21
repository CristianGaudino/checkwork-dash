import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { AnyD1Database } from "drizzle-orm/d1";

// Hand-written subsets of the Cloudflare binding types (RESEARCH Pattern 5): @cloudflare/workers-types clashes with the DOM lib.
// Message shape: developers.cloudflare.com/email-service/api/send-emails/workers-api/
export interface SendEmail {
  send(msg: { to: string; from: string; subject: string; text: string; replyTo?: string }): Promise<{ messageId: string }>;
}

export interface RateLimit {
  limit(opts: { key: string }): Promise<{ success: boolean }>;
}

export interface PhotoBucket {
  put(key: string, value: Blob | ArrayBuffer | ReadableStream, opts?: { httpMetadata?: { contentType?: string } }): Promise<unknown>;
  get(key: string): Promise<{ body: ReadableStream; httpMetadata?: { contentType?: string } } | null>;
  delete(keys: string | string[]): Promise<void>;
  list(opts: { prefix: string; cursor?: string }): Promise<{ objects: { key: string }[]; truncated: boolean; cursor?: string }>;
}

// No DB here: each dealer has a D1 database of its own, reached only through getDb() (src/lib/db), which picks the current dealer's.
// LEAD_PHOTOS is read only by dealerBucket (src/lib/tenancy/current.ts), which keeps each dealer under its own prefix.
type LeadBindings = { EMAIL?: SendEmail; LEAD_LIMITER?: RateLimit; COUNT_LIMITER?: RateLimit; AI_LIMITER?: RateLimit; SITE_LIMITER?: RateLimit; LEAD_PHOTOS?: PhotoBucket; DIRECTORY?: AnyD1Database };

// The one place that reads Cloudflare bindings. Outside the Worker (next start, tests) there is no context, so this returns {}.
export function getBindings(): LeadBindings {
  try {
    return getCloudflareContext().env as LeadBindings;
  } catch {
    return {};
  }
}
