// Test stand-in for OpenNext's worker (.open-next/worker.js, which exists only after `opennextjs-cloudflare build`), so worker.mjs can be
// imported by Vitest (vitest.config.mts aliases it here). Records the dealer each app job was called for, and the job's path with it.
export const fetched: string[] = [];
export const paths: string[] = [];
const handler = { fetch: async (req: Request) => (fetched.push(new URL(req.url).searchParams.get("dealer") ?? ""), paths.push(new URL(req.url).pathname + new URL(req.url).search), Response.json({})) };
export default handler;
export class BucketCachePurge {}
export class DOQueueHandler {}
export class DOShardedTagCache {}
