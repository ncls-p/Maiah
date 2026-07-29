# Project and organization migrations

The access console exposes one workflow for moving or cloning a complete
project or organization. Every mutation is preceded by a server-generated
preview and a confirmation fingerprint. Execution fails closed if permissions,
counts, conflicts, or options changed after the preview.

## Behaviour matrix

| Action                 | Source       | Destination           | Included                                                                                                  | Intentionally retained in source                           |
| ---------------------- | ------------ | --------------------- | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Move project contents  | Project      | Existing project      | Resources, dependencies, histories, members, compatible direct access, custom project roles               | Empty source project container                             |
| Clone project contents | Project      | Existing project      | Configurations, documents, members, roles, direct user access, encrypted secrets when explicitly selected | Chats, run history, audit logs, API keys, pending requests |
| Move organization      | Organization | Existing organization | Projects, teams, members, custom roles, role bindings, tool policies                                      | Empty source organization container                        |
| Clone organization     | Organization | Existing organization | New project copies, teams, members, custom roles, role bindings, tool policies                            | Entire source organization and operational history         |

Cloned scheduled tasks and workflows are disabled or returned to draft state so
the copy cannot execute twice without an administrator reviewing it.

## State contract

- **Loading:** destination controls and actions are disabled while permissions
  and destinations load.
- **Empty:** the dialog explains that no administrable destination matches and
  remains searchable.
- **Error:** the server message is shown without discarding the selected scope
  or mode.
- **Conflict:** move conflicts are listed in the preview and execution stays
  disabled. Clone URLs receive a unique suffix and never overwrite content.
- **Success:** the dialog closes only after the transaction commits.
- **Retry/idempotency:** a confirmation fingerprint prevents applying a stale
  preview. Database uniqueness constraints and conflict-safe membership writes
  prevent duplicate access rows.
- **Permissions:** both source and destination require access administration;
  organization operations also require organization member administration.
- **Secrets:** disabling and reconfiguring is the safe default. Copying
  encrypted secrets requires an explicit choice in clone mode.
- **Destructive boundary:** moving retains the empty source container for
  review. Deletion remains a separate, explicit action.

## Atomicity

Each project clone and each complete organization move or clone runs inside one
database transaction. Any failed dependency, role, member, or resource write
rolls the complete operation back.
