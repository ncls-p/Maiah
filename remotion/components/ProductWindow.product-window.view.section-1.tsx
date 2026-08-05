import { ChevronDownIcon,NetworkIcon,PaperclipIcon,SearchIcon,SendIcon,ShieldCheckIcon,SparklesIcon } from "lucide-react";

import { COLORS,rise,scaleIn } from "../theme";
import type { ProductWindowViewModel } from "./ProductWindow.product-window.view";
import { ResponseCard,SpecialistRun } from "./ProductWindow.prompt";
export function ProductWindowSection1({ model }: { model: ProductWindowViewModel }) {
  const { frame, prompt, sent, thinkingOpacity } = model;
  return (
    <main style={{ position: "relative", minWidth: 0 }}>
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          height: 64,
          padding: "0 24px",
          borderBottom: "1px solid rgba(145,213,224,0.1)",
          background: "rgba(7,18,22,0.54)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
          <div
            style={{
              display: "grid",
              placeItems: "center",
              width: 34,
              height: 34,
              borderRadius: 11,
              color: COLORS.azureBright,
              background: "rgba(37,173,197,0.12)",
              border: "1px solid rgba(104,216,231,0.18)",
            }}
          >
            <NetworkIcon size={16} />
          </div>
          <div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                color: COLORS.white,
                fontSize: 13,
                fontWeight: 700,
              }}
            >
              Atlas <ChevronDownIcon size={12} color="#789198" />
            </div>
            <div style={{ color: "#6f8990", fontSize: 9, marginTop: 2 }}>Orchestrator · ready</div>
          </div>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 7,
            padding: "6px 10px",
            borderRadius: 999,
            color: COLORS.success,
            background: "rgba(127,215,175,0.07)",
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
          }}
        >
          <ShieldCheckIcon size={12} /> Policy active
        </div>
      </header>

      <div
        style={{
          position: "absolute",
          inset: "64px 0 86px",
          display: "grid",
          gridTemplateColumns: "1fr 370px",
          gap: 20,
          padding: "26px 27px 20px",
        }}
      >
        <div>
          <div
            style={{
              ...rise(frame, 44, 20, 18),
              marginLeft: "auto",
              width: 465,
              minHeight: 64,
              padding: "15px 17px",
              borderRadius: "17px 17px 5px 17px",
              color: COLORS.white,
              background: "rgba(37,173,197,0.13)",
              border: "1px solid rgba(104,216,231,0.18)",
              fontSize: 14,
              lineHeight: 1.5,
            }}
          >
            {prompt}
            {!sent ? (
              <span
                style={{
                  display: "inline-block",
                  width: 2,
                  height: 17,
                  marginLeft: 3,
                  verticalAlign: -3,
                  background: COLORS.azureBright,
                  opacity: Math.floor(frame / 8) % 2 ? 0.25 : 1,
                }}
              />
            ) : null}
          </div>
          <div
            style={{
              ...rise(frame, 104, 14, 14),
              display: "flex",
              alignItems: "center",
              gap: 9,
              marginTop: 22,
              color: "#8fa8ae",
              fontSize: 12,
              opacity: thinkingOpacity,
            }}
          >
            <div
              style={{
                display: "grid",
                placeItems: "center",
                width: 28,
                height: 28,
                borderRadius: 9,
                color: COLORS.azureBright,
                background: "rgba(37,173,197,0.1)",
              }}
            >
              <SparklesIcon size={13} />
            </div>
            Coordinating the right specialists
            <span style={{ letterSpacing: 3, color: COLORS.azureBright }}>···</span>
          </div>
          <div
            style={{
              ...scaleIn(frame, 122, 0.97, 20),
              marginTop: 18,
              maxWidth: 530,
              padding: "14px 15px",
              borderRadius: 14,
              color: "#8fa8ae",
              background: "rgba(255,255,255,0.028)",
              border: "1px solid rgba(255,255,255,0.045)",
              fontSize: 11,
              lineHeight: 1.55,
            }}
          >
            <span style={{ color: COLORS.azureBright, fontWeight: 700 }}>Plan</span> · gather market evidence · audit launch dependencies · map mitigations and owners
          </div>
          <ResponseCard />
        </div>

        <div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 11,
              color: "#718b91",
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: "0.13em",
              textTransform: "uppercase",
            }}
          >
            <span>Live delegation</span>
            <span>3 / 3</span>
          </div>
          <div style={{ display: "grid", gap: 9 }}>
            <SpecialistRun name="Research" detail="Market signals and cited evidence" icon={SearchIcon} start={108} color={COLORS.azureBright} />
            <SpecialistRun name="Risk" detail="Operational dependencies and controls" icon={ShieldCheckIcon} start={123} color={COLORS.coral} />
            <SpecialistRun name="Delivery" detail="Owners, milestones, and next actions" icon={NetworkIcon} start={138} color={COLORS.gold} />
          </div>
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          left: 25,
          right: 25,
          bottom: 20,
          display: "flex",
          alignItems: "center",
          gap: 10,
          height: 54,
          padding: "0 8px 0 15px",
          borderRadius: 16,
          color: "#6f8990",
          background: "rgba(15,37,44,0.82)",
          border: "1px solid rgba(145,213,224,0.13)",
          boxShadow: "0 12px 36px rgba(0,0,0,0.2)",
          fontSize: 12,
        }}
      >
        <PaperclipIcon size={15} />
        <span style={{ flex: 1 }}>Message Atlas…</span>
        <div
          style={{
            display: "grid",
            placeItems: "center",
            width: 38,
            height: 38,
            borderRadius: 11,
            color: COLORS.ink,
            background: COLORS.azure,
          }}
        >
          <SendIcon size={15} />
        </div>
      </div>
    </main>
  );
}
