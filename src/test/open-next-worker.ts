// Test stand-in for OpenNext's worker (.open-next/worker.js, which exists only after `opennextjs-cloudflare build`), so worker.mjs can be
// imported by Vitest (vitest.config.ts aliases it here). Records the dealer each app job was called for.
export const fetched: string[] = [];
export default { fetch: async (req: Request) => (fetched.push(new URL(req.url).searchParams.get("dealer") ?? ""), Response.json({})) };
export class BucketCachePurge {}
export class DOQueueHandler {}
export class DOShardedTagCache {}
