import { expect, type Page } from "@playwright/test";

export async function expectTemporaryConversationInHistory(
  page: Page,
  title: string,
) {
  const historyItem = page.locator(
    '[data-slot="chat-conversation-item"][data-ephemeral="true"]',
    { hasText: title },
  );
  await expect(historyItem).toBeVisible();
  await expect(
    historyItem.getByText("Temporary", { exact: true }),
  ).toBeVisible();
}

export async function expectTransientPersistenceConfirmation(page: Page) {
  const title = page.getByText("Saved conversation", { exact: true });
  await expect(title).toBeVisible();
  await expect(
    page.getByText("Kept in your history until you delete it.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(title).toHaveCount(0, { timeout: 4_000 });
}
