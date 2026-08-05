import { BODY_FONT } from "../theme";
import type { useProductWindowController } from "./ProductWindow.product-window";
import { ProductWindowSection1 } from "./ProductWindow.product-window.view.section-1";
import { ProductWindowSection2 } from "./ProductWindow.product-window.view.section-2";

export type ProductWindowViewModel = Extract<ReturnType<typeof useProductWindowController>, { kind: "ready" }>;
export function ProductWindowView({ model }: { model: ProductWindowViewModel }) {
  const { windowIn } = model;
  return (
    <div
      style={{
        position: "absolute",
        left: 525,
        top: 128,
        width: 1310,
        height: 808,
        overflow: "hidden",
        borderRadius: 28,
        border: "1px solid rgba(145,213,224,0.2)",
        background: "rgba(8,25,31,0.94)",
        boxShadow: "0 70px 150px rgba(0,0,0,0.44), 0 0 0 1px rgba(255,255,255,0.03) inset, 0 0 100px rgba(37,173,197,0.08)",
        opacity: windowIn,
        transform: `perspective(1800px) rotateY(${-2.5 + windowIn * 2.5}deg) translateY(${(1 - windowIn) * 64}px) scale(${0.965 + windowIn * 0.035})`,
        transformOrigin: "center right",
        fontFamily: BODY_FONT,
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "250px 1fr",
          height: "100%",
        }}
      >
        <ProductWindowSection2 model={model} />

        <ProductWindowSection1 model={model} />
      </div>
    </div>
  );
}
