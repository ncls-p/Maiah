import { interpolate,useCurrentFrame } from "remotion";

import { fade,progress } from "../theme";
import { ProductWindowView } from "./ProductWindow.product-window.view";
import { PROMPT } from "./ProductWindow.prompt";

export function useProductWindowController() {
  const frame = useCurrentFrame();
  const windowIn = progress(frame, 10, 32);
  const typedCharacters = Math.floor(
    interpolate(frame, [48, 94], [0, PROMPT.length], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }),
  );
  const prompt = PROMPT.slice(0, typedCharacters);
  const sent = frame >= 100;
  const thinkingOpacity =
    fade(frame, 102, 10) *
    interpolate(frame, [150, 164], [1, 0], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });

  return { kind: "ready", frame, prompt, sent, thinkingOpacity, windowIn } as const;
}

export function ProductWindow(...args: Parameters<typeof useProductWindowController>) {
  const model = useProductWindowController(...args);
  if (!("kind" in model)) return model;
  return <ProductWindowView model={model} />;
}
