import { FileTextIcon,FolderIcon,MessageSquareIcon,MoreHorizontalIcon,PlusIcon,SearchIcon } from "lucide-react";

import { BODY_FONT,COLORS } from "../theme";
import type { ProductWindowViewModel } from "./ProductWindow.product-window.view";
import { SidebarRow } from "./ProductWindow.prompt";
export function ProductWindowSection2({ model }: { model: ProductWindowViewModel }) {
  const {} = model;
  return (
    <aside
      style={{
        display: "flex",
        flexDirection: "column",
        padding: 18,
        background: "rgba(11,30,36,0.96)",
        borderRight: "1px solid rgba(145,213,224,0.1)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          height: 38,
          marginBottom: 15,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <div
            style={{
              display: "grid",
              placeItems: "center",
              width: 28,
              height: 28,
              borderRadius: 9,
              color: COLORS.ink,
              background: COLORS.azure,
              fontSize: 12,
              fontWeight: 800,
            }}
          >
            A
          </div>
          <span
            style={{
              color: COLORS.white,
              fontSize: 14,
              fontWeight: 750,
              letterSpacing: "-0.03em",
            }}
          >
            Maiah
          </span>
        </div>
        <MoreHorizontalIcon size={16} color="#789198" />
      </div>
      <button
        type="button"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          height: 38,
          padding: 0,
          borderRadius: 11,
          border: "1px solid rgba(104,216,231,0.18)",
          color: COLORS.white,
          background: "rgba(37,173,197,0.1)",
          fontFamily: BODY_FONT,
          fontSize: 12,
          fontWeight: 650,
        }}
      >
        <PlusIcon size={14} /> New conversation
      </button>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          height: 36,
          marginTop: 13,
          padding: "0 11px",
          borderRadius: 10,
          color: "#718b91",
          background: "rgba(255,255,255,0.025)",
          fontSize: 11,
        }}
      >
        <SearchIcon size={13} /> Search conversations
      </div>
      <div
        style={{
          margin: "23px 11px 8px",
          color: "#5f7980",
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: "0.15em",
          textTransform: "uppercase",
        }}
      >
        Workspace
      </div>
      <SidebarRow icon={MessageSquareIcon} label="Launch operations" active />
      <SidebarRow icon={FolderIcon} label="Market intelligence" />
      <SidebarRow icon={FileTextIcon} label="Weekly brief" />
      <div style={{ flex: 1 }} />
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          paddingTop: 15,
          borderTop: "1px solid rgba(145,213,224,0.1)",
        }}
      >
        <div
          style={{
            display: "grid",
            placeItems: "center",
            width: 30,
            height: 30,
            borderRadius: "50%",
            color: COLORS.ink,
            background: COLORS.gold,
            fontSize: 10,
            fontWeight: 800,
          }}
        >
          ND
        </div>
        <div>
          <div style={{ color: COLORS.white, fontSize: 11, fontWeight: 650 }}>Nicolas</div>
          <div style={{ color: "#688188", fontSize: 9, marginTop: 2 }}>Deodis workspace</div>
        </div>
      </div>
    </aside>
  );
}
