FROM searxng/searxng:latest AS searxng
COPY searxng/settings.yml /etc/searxng/settings.yml
# SearXNG 2026.6.15 made EngineAbout strict while some packaged
# disabled engines can still carry stale `about.language` metadata. Remove the
# known-bad defaults from the image itself and fail the build if the effective
# engine config would crash at runtime.
RUN /usr/local/searxng/.venv/bin/python - <<'PY'
from pathlib import Path

import yaml

from searx.enginelib import EngineAbout
from searx.settings_loader import DEFAULT_SETTINGS_FILE, get_yaml_cfg, load_yaml, update_settings

blocked_engines = {"woxikon.de synonyme", "wikimini"}
default_settings = load_yaml(DEFAULT_SETTINGS_FILE)
default_settings["engines"] = [
    engine for engine in default_settings.get("engines", []) if engine.get("name") not in blocked_engines
]
Path(DEFAULT_SETTINGS_FILE).write_text(
    yaml.safe_dump(default_settings, allow_unicode=True, sort_keys=False),
    encoding="utf-8",
)

user_settings = get_yaml_cfg("settings.yml")
effective_settings = update_settings(default_settings, user_settings)
remaining_blocked = sorted(
    engine.get("name") for engine in effective_settings.get("engines", []) if engine.get("name") in blocked_engines
)
if remaining_blocked:
    raise SystemExit(f"blocked SearXNG engines still enabled: {', '.join(remaining_blocked)}")

for engine in effective_settings.get("engines", []):
    about = engine.get("about")
    if about:
        try:
            EngineAbout(**about)
        except TypeError as exc:
            raise SystemExit(f"invalid about metadata for engine {engine.get('name')!r}: {exc}") from exc
PY

FROM node:22-bookworm-slim AS base

ARG NPM_VERSION=11.18.0

WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    git \
  && rm -rf /var/lib/apt/lists/* \
  && npm install --global "npm@${NPM_VERSION}" --no-audit --no-fund \
  && test "$(npm --version)" = "${NPM_VERSION}"

FROM base AS deps
COPY package.json package-lock.json .npmrc ./
RUN npm ci --no-audit --no-fund

FROM deps AS builder
COPY . .

# Build-time placeholders keep the standalone build reproducible without
# leaking production secrets into the Docker build context. Runtime values are
# injected by Compose/Coolify.
ENV NODE_ENV=production \
    APP_ENV=development \
    BETTER_AUTH_SECRET=buildtimeonlysecretvalue1234567890 \
    BETTER_AUTH_URL=http://localhost:3000 \
    BETTER_AUTH_TRUSTED_ORIGINS=http://localhost:3000 \
    DATABASE_URL=postgresql://postgres:postgres@localhost:5432/ai_hub \
    DATABASE_SSL_REJECT_UNAUTHORIZED=disable \
    APP_ENCRYPTION_KEY=1111111111111111111111111111111111111111111111111111111111111111 \
    APP_ENCRYPTION_KEY_ID=build \
    DRAGONFLY_URL=redis://localhost:6379 \
    DRAGONFLY_PASSWORD=builddragonflypassword \
    OBJECT_STORAGE_ENDPOINT=http://localhost:3900 \
    OBJECT_STORAGE_REGION=us-east-1 \
    OBJECT_STORAGE_BUCKET=ai-hub \
    OBJECT_STORAGE_ACCESS_KEY_ID=build-access-key \
    OBJECT_STORAGE_SECRET_ACCESS_KEY=buildobjectsecretvalue \
    OBJECT_STORAGE_FORCE_PATH_STYLE=true \
    SEARXNG_URL=http://localhost:18088 \
    ALLOW_PERSONAL_WORKSPACES=true

RUN npm run build && mkdir -p public

FROM deps AS migrator
COPY . .
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1
CMD ["node", "scripts/migrate-standalone.mjs"]

FROM deps AS worker
COPY . .
ENV NODE_ENV=production \
    HOSTNAME=0.0.0.0 \
    NEXT_TELEMETRY_DISABLED=1
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD node -e "fetch('http://127.0.0.1:3001/health').then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["sh", "-c", "node scripts/migrate-standalone.mjs && npm run worker"]

FROM deps AS dev
COPY . .
ENV NODE_ENV=development \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    NEXT_TELEMETRY_DISABLED=1
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/api/health').then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["npm", "run", "dev"]

FROM deps AS runner

ENV NODE_ENV=production \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    NEXT_TELEMETRY_DISABLED=1

RUN groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs nextjs

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/scripts/migrate-standalone.mjs ./scripts/migrate-standalone.mjs
COPY --from=builder --chown=nextjs:nodejs /app/src/server/infrastructure/db/migrations ./src/server/infrastructure/db/migrations

USER nextjs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/api/health').then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["sh", "-c", "node scripts/migrate-standalone.mjs && node server.js"]
