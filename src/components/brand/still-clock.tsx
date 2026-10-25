import { BRAND_COLORS } from "@/lib/brand";

/**
 * The clock mark, still and in fixed colours, for places without CSS variables or motion: the favicon, the home-screen
 * icon and the share image. Same drawing as `ClockFace`, on an ink disc.
 */
export function StillClock({ size }: { size: number }) {
  const { ink, ivory, champagne } = BRAND_COLORS;
  const bronze = "#C8925F";
  return (
    <svg width={size} height={size} viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="12" fill={ink} />
      <circle cx="12" cy="12" r="11.4" fill="none" stroke={champagne} strokeOpacity="0.35" strokeWidth="0.5" />
      {Array.from({ length: 12 }, (_, i) => {
        const a = (i / 12) * Math.PI * 2;
        const r1 = i % 3 === 0 ? 9.2 : 10;
        return <line key={i} x1={round(12 + Math.cos(a) * r1)} y1={round(12 + Math.sin(a) * r1)} x2={round(12 + Math.cos(a) * 10.9)} y2={round(12 + Math.sin(a) * 10.9)} stroke={ivory} strokeOpacity="0.5" strokeWidth="0.7" />;
      })}
      {Array.from({ length: 12 }, (_, i) => {
        const a = (i / 12) * Math.PI * 2 + Math.PI / 12;
        return <circle key={`b${i}`} cx={round(12 + Math.cos(a) * 7.8)} cy={round(12 + Math.sin(a) * 7.8)} r={i % 3 === 0 ? 0.55 : 0.32} fill={bronze} fillOpacity={i % 3 === 0 ? 0.9 : 0.55} />;
      })}
      <path d="M7.6 15.6 L14.6 8.6" stroke={ivory} strokeOpacity="0.5" strokeWidth="1.1" strokeLinecap="round" strokeDasharray="1.1 2" />
      <circle cx="7.6" cy="15.6" r="2.1" fill={bronze} />
      <circle cx="14.6" cy="8.6" r="3.7" fill="none" stroke={champagne} strokeWidth="1.5" />
      <circle cx="14.6" cy="4.9" r="1" fill={ivory} />
    </svg>
  );
}

function round(n: number) {
  return Math.round(n * 1000) / 1000;
}
