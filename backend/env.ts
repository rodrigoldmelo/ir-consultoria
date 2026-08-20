import { config } from "dotenv";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
for (const name of [".env.local", ".env"] as const) {
  const path = resolve(root, name);
  if (existsSync(path)) {
    config({ path, override: false });
  }
}
