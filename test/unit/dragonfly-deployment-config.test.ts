import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

const composeFiles = [
  ".coolify/stack.compose.yml",
  "docker-compose.dev.yml",
  "docker-compose.prod.yml",
] as const;

const bullMqCompatibilityFlags = [
  "--cluster_mode=emulated",
  "--lock_on_hashtags",
  "--default_lua_flags=allow-undeclared-keys",
] as const;

describe.each(composeFiles)("Dragonfly deployment configuration in %s", (file) => {
  it.each(bullMqCompatibilityFlags)("enables %s", async (flag) => {
    const compose = await readFile(path.join(process.cwd(), file), "utf8");

    expect(compose).toContain(flag);
  });
});
