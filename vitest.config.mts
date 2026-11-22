import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // OpenNext's worker exists only after its build: worker.mjs's tests get a stand-in (src/test/open-next-worker.ts).
  resolve: { alias: [{ find: "@", replacement: fileURLToPath(new URL("./src", import.meta.url)) }, { find: /^\.\/\.open-next\/worker\.js$/, replacement: fileURLToPath(new URL("./src/test/open-next-worker.ts", import.meta.url)) }] },
  // The deploy job sets APP_ENV=demo for every step, which hands the modules to the demo cookie: tests start from no build setting and
  // stub one when they need it, so they pass the same in CI, the deploy and on a laptop.
  test: { environment: "node", include: ["src/**/*.test.ts"], setupFiles: ["./vitest.setup.ts"], env: { APP_ENV: "", NEXT_PUBLIC_ACCESS_ENABLED: "", SIGN_IN: "", E2E_SIGN_IN: "" } },
});
