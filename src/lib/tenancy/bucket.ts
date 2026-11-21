import type { PhotoBucket } from "../leads/bindings";

// Relative imports only: worker.mjs (the nightly lead purge) bundles this outside Next's "@/" alias.
// One bucket for every dealer, each under dealers/<id>/: a dealer's code names its keys as before (cars/..., media/...) and never sees
// another dealer's. list() gives keys back without the prefix.
export function prefixedBucket(bucket: PhotoBucket, dealerId: string): PhotoBucket {
  if (!/^[a-z0-9-]+$/.test(dealerId)) throw new Error("Bad dealer id");
  const pre = `dealers/${dealerId}/`;
  return {
    put: (key, value, opts) => bucket.put(pre + key, value, opts),
    get: (key) => bucket.get(pre + key),
    delete: (keys) => bucket.delete(typeof keys === "string" ? pre + keys : keys.map((k) => pre + k)),
    list: async (opts) => {
      const r = await bucket.list({ ...opts, prefix: pre + opts.prefix });
      return { ...r, objects: r.objects.map((o) => ({ ...o, key: o.key.slice(pre.length) })) };
    },
  };
}
