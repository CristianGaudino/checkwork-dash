import { defineConfig } from "drizzle-kit";

// The directory's schema (dealers and who works at each), apart from a dealer's own store (drizzle.config.ts). Only generates SQL;
// wrangler applies it (npm run directory:migrate).
export default defineConfig({
  dialect: "sqlite",
  out: "./drizzle-directory",
  schema: "./src/lib/db/directory-schema.ts",
});
