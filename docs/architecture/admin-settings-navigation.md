# Administration settings navigation

Administration uses a shared layout with separate organization and platform pages.
The desktop sidebar has an active-page indicator and its own bounded scroll area;
on small screens it becomes a labeled native selector. Organization selection is
stored in `organizationId` and retained by links between settings pages.

Organization pages separate creation/lifecycle, projects, members, branding,
sidebar navigation, chat automation, workflow builder, companion, and connections.
Connections retains the existing Microsoft and Genesys persistence and permissions.
Advanced chat welcome copy is collapsed inside branding. Platform pages load only
their required data and check platform administrator access on the server.

Legacy settings and access links redirect to the corresponding pages. Unknown
settings sections return 404. An inaccessible explicit organization never falls
back to another organization in the scoped settings form.

## Verification matrix

| Journey | Verification |
| --- | --- |
| Desktop sidebar and connection configuration | Local authenticated browser |
| Change organization, navigate to another section | Local authenticated browser; same organization ID retained |
| Mobile section selector and overflow | Local browser at 390px; document width 390px, content 390px |
| Legacy access redirects | Unit tests |
| Platform permission | Server-side guard before loading settings; existing API guards retained |
| Initial organization fetch error | Persistent error with retry; scoped settings hidden |
| Missing organization | Explicit message; no substitute organization settings rendered |
| Production Entra interaction and real tenant sign-in | Pending production rollout and interactive Microsoft authentication |

No settings storage migration is required for this navigation change.
