// A small burst of citron and copper from an element: the reward for finishing a step.
// Plain DOM so it outlives the component that fired it. Skipped under reduced motion.

const COLORS = ["var(--accent)", "var(--copper)", "var(--accent-ink)", "var(--warning)"];

function motionReduced() {
  const pref = document.documentElement.dataset.motion;
  if (pref === "reduced") return true;
  if (pref === "full") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function celebrate(from: Element | null, { count = 18, spread = 70 }: { count?: number; spread?: number } = {}) {
  if (!from || typeof window === "undefined" || motionReduced()) return;
  const r = from.getBoundingClientRect();
  const x = r.left + r.width / 2;
  const y = r.top + r.height / 2;
  const layer = document.createElement("div");
  layer.setAttribute("aria-hidden", "true");
  layer.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:80;overflow:hidden";
  document.body.appendChild(layer);

  const ring = document.createElement("span");
  ring.style.cssText = `position:absolute;left:${x}px;top:${y}px;width:10px;height:10px;margin:-5px 0 0 -5px;border-radius:9999px;border:2px solid var(--accent)`;
  layer.appendChild(ring);
  ring.animate([{ transform: "scale(1)", opacity: 0.9 }, { transform: `scale(${spread / 8})`, opacity: 0 }], { duration: 650, easing: "cubic-bezier(.2,.7,.2,1)", fill: "forwards" });

  for (let i = 0; i < count; i++) {
    const p = document.createElement("span");
    const size = 4 + Math.random() * 5;
    const round = Math.random() > 0.5;
    p.style.cssText = `position:absolute;left:${x}px;top:${y}px;width:${size}px;height:${round ? size : size * 0.45}px;margin:${-size / 2}px 0 0 ${-size / 2}px;border-radius:${round ? "9999px" : "1px"};background:${COLORS[i % COLORS.length]}`;
    layer.appendChild(p);
    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
    const dist = spread * (0.6 + Math.random() * 0.7);
    const dx = Math.cos(angle) * dist;
    const dy = Math.sin(angle) * dist - spread * 0.35;
    p.animate(
      [
        { transform: "translate(0,0) rotate(0deg) scale(1)", opacity: 1 },
        { transform: `translate(${dx}px, ${dy}px) rotate(${Math.random() * 360}deg) scale(1)`, opacity: 1, offset: 0.6 },
        { transform: `translate(${dx * 1.1}px, ${dy + spread * 0.6}px) rotate(${Math.random() * 540}deg) scale(0.6)`, opacity: 0 },
      ],
      { duration: 900 + Math.random() * 400, easing: "cubic-bezier(.2,.7,.2,1)", fill: "forwards" },
    );
  }
  window.setTimeout(() => layer.remove(), 1500);
}
