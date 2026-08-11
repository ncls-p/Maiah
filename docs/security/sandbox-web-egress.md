# Sandbox web egress

Code runs may read public HTTP and HTTPS resources through the dedicated
`sandbox-egress-proxy`. The runner itself is attached only to an internal
Docker network and has no direct route to application, database, metadata, or
host services.

The proxy resolves destinations before connecting and rejects loopback,
link-local, private, reserved, and mixed public/private DNS results. It permits
only GET and HEAD on ports 80 and 443, blocks common package registries, limits
each transfer, and times requests out. Redirects are evaluated as new proxy
requests, so they cannot bypass destination checks.

The sandbox image removes npm, npx, pip, Corepack, Yarn, and pnpm after its
curated dependencies are installed. Runs execute as an unprivileged user on a
read-only root filesystem; writable run directories are size-bounded,
file-size-limited, container-scoped to 64 PIDs, and deleted after every
execution. Web access is therefore intended for bounded API calls and document
reads, not dependency installation or durable downloads.

HTTP clients receive `HTTP_PROXY`, `HTTPS_PROXY`, their lowercase equivalents,
and `NODE_USE_ENV_PROXY=1`. This covers curl, Python's standard HTTP clients,
and Node.js built-in `fetch` while keeping the same egress policy across the
three supported sandbox languages.
