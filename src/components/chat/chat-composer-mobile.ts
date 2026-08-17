type ComposerPointerTarget = {
  closest: (selector: string) => unknown;
};

type ComposerPointerEvent = {
  pointerType: string;
  target: EventTarget | null;
  preventDefault: () => void;
};

function asPointerTarget(target: EventTarget | null) {
  if (
    !target ||
    typeof (target as unknown as ComposerPointerTarget).closest !== "function"
  ) {
    return null;
  }
  return target as unknown as ComposerPointerTarget;
}

export function preserveComposerTextFocus(event: ComposerPointerEvent) {
  if (event.pointerType !== "touch" && event.pointerType !== "pen") return;
  const target = asPointerTarget(event.target);
  if (!target) return;
  if (target.closest("textarea, input")) return;
  if (target.closest("button, [role='button']")) event.preventDefault();
}
