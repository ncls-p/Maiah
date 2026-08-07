# Assistant access scopes

Assistant access is selected during creation and can be changed from the
assistant's essential settings. The UI only exposes scopes that the current
user is allowed to assign.

| Scope | Who can discover and use the assistant | Required permission to assign |
| --- | --- | --- |
| Only me | The creator | None beyond `agents.create` |
| Project | Authorized members of the current project | `roles.manage` on the project |
| Organization | Authorized organization members who can access the current project | `roles.manage` on the organization |
| Team | Members of one team in the current organization | `roles.manage` on the project |

Selecting a team creates a resource-level group binding with the system role
`workspace.agent_user`. That role grants only `agents.get`, `agents.chat`, and
`agents.test`. It deliberately does not grant update, delete, curation, or role
management permissions. Editing therefore remains limited to the creator and
administrators who already hold the relevant management permissions.

The API validates the requested scope independently of the client, rejects
teams from another organization, and invalidates affected team members'
permission caches after the transaction commits. Switching away from a team
removes the previous binding. Legacy sharing fields remain readable for
backward compatibility, while the product UI uses the scope model above.

Organization scope does not bypass project membership. An organization member
must still be authorized for the project that owns the assistant.
