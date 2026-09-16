import { cache } from "@/server/infrastructure/cache";
import { encryptValue, decryptValue } from "@/lib/crypto";
import {
  SENSITIVE_FIELD,
  redactPageText,
  type PageContext,
  type UiAction,
  type CompanionCommand,
} from "./contracts";
const key = (userId: string, workspaceId: string, contextId: string) =>
  `companion:${userId}:${workspaceId}:${contextId}`;
export async function readPage(
  userId: string,
  workspaceId: string,
  contextId: string,
) {
  const value = await cache.get<string>(
    `${key(userId, workspaceId, contextId)}:page`,
  );
  if (!value)
    throw new Error(
      "Page context unavailable. Ask the user to open the companion and enable page context.",
    );
  return JSON.parse(await decryptValue(value)) as PageContext;
}
export async function pollPage(
  userId: string,
  workspaceId: string,
  contextId: string,
  page: PageContext | null,
) {
  const scope = key(userId, workspaceId, contextId);
  if (!page) {
    await cache.del(`${scope}:page`);
    return [];
  }
  const redacted = {
    ...page,
    title: redactPageText(page.title),
    text: page.text ? redactPageText(page.text) : undefined,
    headings: page.headings.map(redactPageText),
    elements: page.elements
      .filter((element) => !SENSITIVE_FIELD.test(element.label))
      .map((element) => ({
        ...element,
        label: redactPageText(element.label),
        ...(element.value !== undefined
          ? { value: redactPageText(element.value) }
          : {}),
      })),
  };
  await cache.set(
    `${scope}:page`,
    await encryptValue(JSON.stringify(redacted)),
    20,
  );
  const count = (await cache.get<number>(`${scope}:sequence`)) ?? 0;
  const pending: CompanionCommand[] = [];
  for (let index = Math.max(1, count - 10); index <= count; index++) {
    const command = await cache.get<CompanionCommand>(
      `${scope}:command:${index}`,
    );
    if (
      command &&
      (await cache.get(`${scope}:issued:${command.id}`)) &&
      Date.now() - command.createdAt < 20_000 &&
      (await cache.incr(`${scope}:claim:${command.id}`, 60)) === 1
    )
      pending.push(command);
  }
  return pending;
}
export async function acknowledgeAction(
  userId: string,
  workspaceId: string,
  contextId: string,
  id: string,
  result: { ok: boolean; error?: string },
) {
  const scope = key(userId, workspaceId, contextId);
  if (!(await cache.get(`${scope}:issued:${id}`)))
    throw new Error("Unknown or expired action");
  await cache.set(`${scope}:result:${id}`, result, 60);
}
export async function performUiAction(
  userId: string,
  workspaceId: string,
  contextId: string,
  action: UiAction,
  signal?: AbortSignal,
) {
  const page = await readPage(userId, workspaceId, contextId);
  if (action.action !== "navigate" && action.path !== page.path)
    throw new Error("Page changed; read the current context again");
  if (
    ["click", "fill"].includes(action.action) &&
    !page.elements.some(
      (element) => element.id === action.target && !element.disabled,
    )
  )
    throw new Error("Element is unavailable");
  const scope = key(userId, workspaceId, contextId);
  const sequence = await cache.incr(`${scope}:sequence`, 600);
  if (!sequence) throw new Error("Companion connection unavailable");
  const id = crypto.randomUUID();
  const command = { id, action, createdAt: Date.now() };
  await cache.set(`${scope}:issued:${id}`, true, 60);
  await cache.set(`${scope}:command:${sequence}`, command, 25);
  const deadline = Date.now() + 22_000;
  try {
    while (Date.now() < deadline) {
      if (signal?.aborted) throw new Error("Action cancelled");
      const result = await cache.get<{ ok: boolean; error?: string }>(
        `${scope}:result:${id}`,
      );
      if (result) return result;
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    throw new Error(
      "No confirmation from the browser; do not retry automatically",
    );
  } finally {
    await Promise.all([
      cache.del(`${scope}:command:${sequence}`),
      cache.del(`${scope}:issued:${id}`),
      cache.del(`${scope}:result:${id}`),
    ]);
  }
}
