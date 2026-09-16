import { redactErrorText } from "@/lib/error-report";
import {
  SENSITIVE_FIELD,
  type PageContext,
  type UiAction,
} from "@/modules/companion/contracts";
const ids = new WeakMap<Element, string>();
const targets = new Map<string, Element>();
let sequence = 0;
export function sensitive(element: Element) {
  const input = element as HTMLInputElement;
  const label = element.getAttribute("aria-label") ?? "";
  const labels = input.labels
    ? [...input.labels].map((item) => item.textContent).join(" ")
    : "";
  return (
    !!element.closest(
      '[data-companion-private], [data-companion-root], [autocomplete="current-password"], [autocomplete="new-password"]',
    ) ||
    ["password", "hidden", "file"].includes(input.type) ||
    SENSITIVE_FIELD.test(
      [
        input.name,
        input.id,
        input.autocomplete,
        input.placeholder,
        label,
        labels,
      ].join(" "),
    )
  );
}
function visible(element: Element) {
  const rect = element.getBoundingClientRect();
  return (
    rect.width > 0 &&
    rect.height > 0 &&
    rect.bottom > 0 &&
    rect.right > 0 &&
    rect.top < innerHeight &&
    rect.left < innerWidth &&
    getComputedStyle(element).visibility !== "hidden" &&
    !element.closest('[aria-hidden="true"], [inert]')
  );
}
function labelFor(element: Element) {
  const input = element as HTMLInputElement;
  const ids = element
    .getAttribute("aria-labelledby")
    ?.split(" ")
    .map((id) => document.getElementById(id)?.textContent ?? "")
    .join(" ");
  return (
    element.getAttribute("aria-label") ||
    ids ||
    (input.labels
      ? [...input.labels].map((label) => label.textContent).join(" ")
      : "") ||
    input.placeholder ||
    element.textContent ||
    input.name ||
    element.tagName
  )
    .trim()
    .slice(0, 300);
}
export function capturePage(
  cursor: { x: number; y: number } | null,
): PageContext {
  targets.clear();
  const text: string[] = [];
  let length = 0;
  const walker = document.createTreeWalker(
    document.getElementById("workspace-main") ?? document.body,
    NodeFilter.SHOW_TEXT,
  );
  for (
    let node = walker.nextNode();
    node && length < 12000;
    node = walker.nextNode()
  ) {
    const parent = node.parentElement;
    if (
      !parent ||
      !visible(parent) ||
      sensitive(parent) ||
      parent.closest("script,style,input,textarea,select")
    )
      continue;
    const value = node.textContent?.trim();
    if (value) {
      text.push(value);
      length += value.length;
    }
  }
  const elements = [
    ...document.querySelectorAll(
      'a[href], button, input, textarea, select, [role="button"], [role="option"], [role="tab"], [role="combobox"], [contenteditable="true"]',
    ),
  ]
    .filter((element) => visible(element) && !sensitive(element))
    .slice(0, 150)
    .map((element) => {
      let id = ids.get(element);
      if (!id) {
        id = `control-${++sequence}`;
        ids.set(element, id);
      }
      targets.set(id, element);
      const label = labelFor(element);
      const control = element as HTMLInputElement;
      const canRead =
        ["INPUT", "TEXTAREA", "SELECT"].includes(element.tagName) &&
        !SENSITIVE_FIELD.test(label);
      return {
        id,
        tag: element.tagName.toLowerCase(),
        role: element.getAttribute("role") ?? "",
        label,
        ...(canRead
          ? {
              value: redactErrorText(
                control.type === "checkbox" || control.type === "radio"
                  ? String(control.checked)
                  : control.value,
              ).slice(0, 2000),
            }
          : {}),
        disabled:
          Boolean(control.disabled) ||
          element.getAttribute("aria-disabled") === "true",
      };
    });
  const targetOf = (element: Element | null) => {
    while (element) {
      const id = ids.get(element);
      if (id && targets.has(id)) return id;
      element = element.parentElement;
    }
    return null;
  };
  return {
    path: location.pathname,
    title: redactErrorText(document.title).slice(0, 300),
    text: redactErrorText(text.join(" ")).slice(0, 12000),
    cursor: cursor
      ? {
          ...cursor,
          target: targetOf(document.elementFromPoint(cursor.x, cursor.y)),
        }
      : null,
    focus: targetOf(document.activeElement),
    elements,
    headings: [...document.querySelectorAll("h1,h2,h3")]
      .filter((element) => visible(element) && !sensitive(element))
      .map((element) => (element.textContent ?? "").slice(0, 300))
      .slice(0, 30),
  };
}
export async function applyUiAction(
  action: UiAction,
  navigate: (path: string) => void,
  refresh: () => void,
) {
  if (action.action === "navigate") {
    if (
      !/^\/(en|fr)\/(?!auth(?:\/|$))[^\\?#]*$/.test(action.path) ||
      action.path.includes("..")
    )
      throw new Error("Only application page navigation is allowed");
    navigate(action.path);
    return;
  }
  if (location.pathname !== action.path)
    throw new Error("The page changed; read its context again");
  if (action.action === "refresh") {
    refresh();
    return;
  }
  const target = action.target ? targets.get(action.target) : null;
  if (
    !(target instanceof HTMLElement) ||
    !target.isConnected ||
    !visible(target) ||
    sensitive(target) ||
    (target as HTMLInputElement).disabled ||
    target.getAttribute("aria-disabled") === "true"
  )
    throw new Error("The target is no longer available");
  if (action.action === "fill") {
    if (
      !(
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement
      ) ||
      (target as HTMLInputElement).readOnly
    )
      throw new Error("This field cannot be edited");
    const prototype =
      target instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : target instanceof HTMLSelectElement
          ? HTMLSelectElement.prototype
          : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
    if (!setter) throw new Error("Unsupported field");
    target.focus();
    setter.call(target, action.value ?? "");
    target.dispatchEvent(new Event("input", { bubbles: true }));
    target.dispatchEvent(new Event("change", { bubbles: true }));
  } else {
    if (target instanceof HTMLAnchorElement) {
      const url = new URL(target.href);
      if (
        url.origin !== location.origin ||
        !/^\/(en|fr)\//.test(url.pathname) ||
        /\/auth\//.test(url.pathname)
      )
        throw new Error("External or authentication navigation is unavailable");
    }
    target.focus();
    target.click();
  }
  target.scrollIntoView({ block: "nearest", behavior: "instant" });
}
