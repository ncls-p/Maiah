// Shared by runtime discovery and the generated coverage inventory.
export function actionExclusion(path: string): string | null {
  if (/^\/api\/(?:auth|mcp|companion|v1|health|openapi)(?:\/|$)/.test(path))
    return "Protocol, authentication or infrastructure endpoint";
  if (/\/(?:webhook|callback)(?:\/|$)/.test(path)) return "Inbound callback";
  if (/\/(?:chat|stream|agentic)$/.test(path))
    return "Interactive stream: use chat UI or durable agent runs";
  return null;
}
