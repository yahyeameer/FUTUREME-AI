import { ImageResponse } from "next/og";
import { BRAND_COLORS } from "@/lib/brand";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** The threshold symbol on ink, for home screens. */
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: BRAND_COLORS.ink }}>
        <svg width="120" height="120" viewBox="0 0 32 32">
          <rect x="5" y="8.5" width="22" height="2.25" rx="1.125" fill={BRAND_COLORS.champagne} />
          <path d="M12.6 27 L15.15 13.6 H16.85 L19.4 27 Z" fill={BRAND_COLORS.ivory} />
        </svg>
      </div>
    ),
    size,
  );
}
