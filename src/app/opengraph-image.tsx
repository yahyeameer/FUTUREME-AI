import { ImageResponse } from "next/og";
import { StillClock } from "@/components/brand/still-clock";
import { BRAND, BRAND_COLORS } from "@/lib/brand";

// The share preview. It carries the brand only: never a name, goal or anything from someone's workspace.

export const alt = `${BRAND.name}. ${BRAND.tagline}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  const { ink, midnight, ivory, champagne, slate } = BRAND_COLORS;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 80, background: `linear-gradient(180deg, ${midnight} 0%, ${ink} 100%)`, color: ivory }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <StillClock size={64} />
          <div style={{ fontSize: 34, letterSpacing: 12 }}>{BRAND.name}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={{ fontSize: 84, lineHeight: 1.02, letterSpacing: -2 }}>{BRAND.tagline}</div>
          <div style={{ fontSize: 32, color: slate }}>{BRAND.promise}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 22, color: champagne, letterSpacing: 4 }}>
          <div style={{ width: 64, height: 2, background: champagne }} />
          {BRAND.category.toUpperCase()}
        </div>
      </div>
    ),
    size,
  );
}
