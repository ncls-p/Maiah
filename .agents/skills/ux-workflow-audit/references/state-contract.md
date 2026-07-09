# Workflow state contract

Use this checklist for every resource list, detail page, editor, and mutation.

| State              | Required behavior                                                               |
| ------------------ | ------------------------------------------------------------------------------- |
| Initial loading    | Stable skeleton or labeled progress; no premature empty state                   |
| Success            | Current resource, correct permission actions, localized metadata                |
| Empty              | Explains what is absent and offers one relevant next action                     |
| Filtered empty     | Says no result matches; preserves the underlying collection                     |
| Initial error      | Persistent explanation and retry; mutations fail closed                         |
| Refresh error      | Preserve last valid data and disclose that it may be stale                      |
| Validation error   | Associate the message with the field and focus the first invalid control        |
| Conflict           | Explain concurrent change and offer reload/reconcile behavior                   |
| Read-only          | Explain ownership or permission and hide impossible mutations                   |
| Mutation pending   | Disable duplicate/conflicting actions and retain user input                     |
| Mutation failure   | Keep context and input; show a retryable, specific outcome                      |
| Destructive action | Name the resource and consequence; require deliberate confirmation              |
| Cancellation       | Stop or request cancellation visibly; converge on a terminal state              |
| Mobile             | No horizontal overflow; secondary actions remain discoverable without hover     |
| Keyboard           | Logical tab order, visible focus, semantic buttons, Escape/Enter where expected |
| Localization       | No hard-coded visible copy; locale-aware dates, numbers, and plurals            |
