# Sandbox web egress

Code runs may read public HTTP and HTTPS resources through the dedicated
`sandbox-egress-proxy`. The runner itself is attached only to an internal
Docker network and has no direct route to application, database, metadata, or
host services.

The proxy resolves destinations before connecting and rejects loopback,
link-local, private, reserved, and mixed public/private DNS results. It permits
only GET and HEAD on ports 80 and 443, limits each transfer, and times requests
out. Redirects are evaluated as new proxy requests, so they cannot bypass
destination checks. Public package registries follow the same policy.

The sandbox image keeps project package managers available so an approved
workspace command can install dependencies into its isolated run directory.
Runs still execute as an unprivileged user on a read-only root filesystem;
writable run directories are size-bounded, file-size-limited,
container-scoped to 64 PIDs, and deleted when the execution turn ends. Every
command gets a fresh process, while the bounded session directory preserves Git
state, caches, and project-local dependencies during the turn. Package scripts
receive no application, database, object-storage, host, or provider credentials.
Registry traffic is subject to the same public-address checks, transfer limits,
and timeout as every other request.

HTTP clients receive `HTTP_PROXY`, `HTTPS_PROXY`, their lowercase equivalents,
and `NODE_USE_ENV_PROXY=1`. This covers curl, Python's standard HTTP clients,
and Node.js built-in `fetch` while keeping the same egress policy across the
three supported sandbox languages.

Durable code workspaces are hydrated through the same runner. The application
checkpoints only the bounded created, modified, and deleted files reported by
the runner, then the physical run directory is wiped. See
`docs/architecture/code-workspace-runtime.md`.
