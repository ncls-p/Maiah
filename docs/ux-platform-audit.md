# Platform UX audit

This audit treats each workspace route as a complete workflow and keeps the
simple path visible while placing specialist controls behind progressive
disclosure.

| Surface                        | Default path                                             | Advanced help                            | Responsive verification |
| ------------------------------ | -------------------------------------------------------- | ---------------------------------------- | ----------------------- |
| Chat                           | Choose an assistant and send a message                   | Capabilities, impact metrics, sources    | Desktop and 390 px      |
| Assistants                     | Name, model, instructions                                | Generation, memory, approvals, safety    | Desktop and 390 px      |
| Knowledge                      | Create a collection, add documents, connect an assistant | Semantic search, chunking, ranking, OCR  | Desktop and 390 px      |
| AI connections                 | Name, address, key                                       | Protocol, authentication, model metrics  | Desktop and 390 px      |
| Tools & MCP                    | Choose or connect a capability                           | Transport, secrets, headers, environment | Desktop and 390 px      |
| Planning                       | Choose an assistant and schedule                         | Interval and execution controls          | Desktop and 390 px      |
| Workflows                      | Add and connect steps                                    | Retries, timeouts, raw parameters        | Desktop and 390 px      |
| Access, usage, audit, settings | Review then act                                          | Permission- or admin-scoped controls     | Desktop and 390 px      |

Legacy MCP and custom-tool routes are also covered through their canonical
redirects. Auth, API documentation, and assistant detail screens receive a
dedicated narrow-viewport check. Marketplace and workflow detail routes retain
their feature-specific browser coverage, including the mobile workflow editor.

## State contract

- Loading keeps a stable page shell and a labelled progress state.
- Load failures remain distinct from empty collections and offer retry where a
  mutation would otherwise be unsafe.
- Destructive actions name the affected resource and require confirmation.
- Technical labels provide keyboard-focusable, localized explanations.
- Dialogs and sheets stay inside the small viewport, scroll internally, and
  preserve visible close actions without internal horizontal overflow.
- Icon-only actions expose a name; the shared button displays that name as a
  tooltip when no explicit title is supplied.

Automated coverage lives in `test/e2e/responsive-ux.spec.ts`; feature-specific
specifications continue to cover successful mutations, validation, permissions,
uploads, and destructive confirmations.
