import { ImageResponse } from "next/og";
import { StillClock } from "@/components/brand/still-clock";
import { BRAND_COLORS } from "@/lib/brand";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** The clock mark on ink, for home screens. */
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: BRAND_COLORS.ink }}>
        <StillClock size={140} />
      </div>
    ),
    size,
  );
}
