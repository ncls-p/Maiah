// Entry point for the background worker.
//
// Loads .env (via @next/env, the same mechanism scripts/migrate.ts uses)
// before ./index is evaluated. index.ts statically imports @/lib/env, which
// validates process.env at module load, so the .env values must already be in
// process.env. Without this, a locally-run worker (no injected environment)
// fails env validation at startup. In container deployments the environment is
// already injected, so loadEnvConfig is a no-op (it never overrides existing
// process.env values).
import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;

loadEnvConfig(process.cwd());

// Dynamic import is intentional (ts-no-dynamic-import exception): a static
// `import "./index"` would be hoisted and evaluated before loadEnvConfig above,
// running @/lib/env's process.env validation before .env is loaded. Deferring
// the import guarantees the environment is ready first.
await import("./index");
