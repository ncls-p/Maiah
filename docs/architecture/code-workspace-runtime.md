# Unified code workspace runtime

Every model-driven filesystem mutation or code execution enters
`CodeWorkspaceRuntime`. A chat route, orchestrated run, workflow, scheduled
task, or compatibility tool must not call the sandbox runner or workspace
object storage as an alternative execution path.

## Model-facing contract

An attached code workspace exposes only four local tools:

- `read` reads bounded text ranges and returns a continuation offset;
- `edit` applies one or more unique, non-overlapping exact replacements;
- `write` creates or completely rewrites a text file;
- `bash` runs search, file operations, tests, builds, Node.js, or Python inside
  the isolated workspace.

Workspace identity is server-owned. Tool inputs never contain project IDs,
storage keys, runner sockets, container IDs, or credentials. Skills, knowledge,
general built-ins, and the to-do tool are omitted while an attached code
workspace is active. External effects such as publishing remain separate
approved actions and do not receive sandbox credentials.

Existing `run_code_sandbox` and `code_workspace_*` bindings are compatibility
capabilities. The chat runtime collapses them into the four tools above rather
than exposing their legacy schemas to the model.

## Lifetimes

The same runtime supports two lifetimes:

- **durable** workspaces checkpoint mutations to object storage and return the
  existing live preview artifact;
- **ephemeral** workspaces keep files only for the current execution and are
  discarded afterward.

Selecting Coding mode without an existing project creates an empty durable
workspace on the server before model execution. The first write or command can
therefore create any supported project structure without a separate creation
tool.

## Sandbox boundary

The first command hydrates the logical snapshot into a fresh physical session
directory. Later commands in the same execution turn reuse that directory, so
Git state, build caches, and project-local dependencies remain available. Every
command still starts a fresh unprivileged process, streams bounded output, kills
its process group on timeout, and reports created, modified, and deleted files.
The runtime checkpoints those changes before returning the tool result and
wipes the session directory when the turn ends. An idle-session TTL provides
crash cleanup.

The runner accepts at most 500 files and 50 MB of workspace content, matching
the durable workspace bounds. Unchanged input files return metadata only;
changed content is returned for checkpointing. Internal entry files, `.git`,
dependency directories, home, and temporary directories are excluded.

Public network access passes through the sandbox egress proxy. Package managers
remain inside the image so an approved `bash` action can install project-local
dependencies, but the proxy still rejects local, private, link-local, reserved,
metadata, and mixed public/private destinations. No application, database,
object-storage, or provider credential is mounted into the runner.

## Runtime invariants

1. A model-facing code operation has one opaque runtime identity.
2. Workspace and actor access are checked again when the snapshot is read or
   checkpointed.
3. Operations within one runtime are serialized, including failed mutations.
4. `edit` matches every replacement against the original file and rejects
   ambiguity or overlap before writing.
5. A failed command may still checkpoint filesystem changes it completed.
6. Missing changed-file content fails closed instead of silently losing work.
7. Bash keeps the existing restricted-tool permission and approval lifecycle;
   non-interactive runs fail closed when approval is required.
8. Tool payload persistence and live streams continue through the shared
   secret-aware projection boundary.
