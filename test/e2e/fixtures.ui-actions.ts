import { expect,type Locator } from "@playwright/test";

async function expectHydrated(locator: Locator) {
  await expect(locator).toBeVisible();
  await expect
    .poll(() =>
      locator.evaluate((element) =>
        Object.keys(element).some((key) => key.startsWith("__reactProps$") || key.startsWith("__reactFiber$")),
      ),
    )
    .toBe(true);
}

async function expectStable(locator: Locator) {
  await expect
    .poll(() =>
      locator.evaluate(
        (element) =>
          new Promise<boolean>((resolve) => {
            window.setTimeout(() => resolve(element.isConnected), 250);
          }),
      ),
    )
    .toBe(true);
}

export async function activate(locator: Locator) {
  await expect(locator).toBeVisible();
  await locator.dispatchEvent("click");
}

export async function openDropdown(locator: Locator) {
  await expectHydrated(locator);
  await expectStable(locator);
  await locator.click();
  await expect(locator).toHaveAttribute("data-state", "open");
}

export async function fillControlled(locator: Locator, value: string) {
  await expectHydrated(locator);
  await expect(locator).toBeEditable();
  await locator.evaluate((element, nextValue) => {
    const input = element as HTMLInputElement | HTMLTextAreaElement;
    const prototype = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(input, nextValue);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }, value);
  await expect(locator).toHaveValue(value);
}
