// One scheduled job for each dealer in turn (worker.mjs): each runs whatever the others do, so one dealer's failure (its database down, a
// bad record) never stops the next; the caller fails the run if any failed, so Cloudflare marks it failed and the next run tries again.
// Logs the job, the dealer's id and the counts `run` returns (null: nothing to say), never the error itself: a database error carries the
// values it was given, which may be a customer's. Relative imports only: worker.mjs bundles this outside Next's "@/" alias.
export async function runForDealers<D extends { id: string }>(dealers: D[], job: string, run: (dealer: D) => Promise<Record<string, unknown> | null>): Promise<number> {
  let failed = 0;
  for (const dealer of dealers) {
    try {
      const counts = await run(dealer);
      if (counts) console.log(JSON.stringify({ job, dealer: dealer.id, ...counts }));
    } catch {
      failed++;
      console.error(JSON.stringify({ job, dealer: dealer.id, error: "failed" }));
    }
  }
  return failed;
}
