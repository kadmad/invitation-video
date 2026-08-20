// Fixed, hand-placed positions rather than randomized on every render —
// keeps this a static set of elements (no re-render churn) and avoids a
// layout-shifting Math.random() on each mount. Only `opacity`/`transform`
// are animated (GPU-composited, no layout/paint cost), and the whole thing
// respects prefers-reduced-motion.
const DOTS = [
  { top: "12%", left: "8%", size: 5, delay: "0s" },
  { top: "22%", left: "88%", size: 4, delay: "0.4s" },
  { top: "68%", left: "5%", size: 6, delay: "0.9s" },
  { top: "80%", left: "92%", size: 4, delay: "1.3s" },
  { top: "10%", left: "45%", size: 3, delay: "1.7s" },
  { top: "50%", left: "96%", size: 5, delay: "0.6s" },
  { top: "88%", left: "40%", size: 3, delay: "2s" },
];

/** Purely decorative twinkling gold dots for the hero banner — an
 * invitation-site flourish. Absolutely positioned within whatever
 * `relative`-positioned ancestor renders it; pointer-events-none so it
 * never intercepts clicks. */
export default function Sparkles() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
      {DOTS.map((d, i) => (
        <span
          key={i}
          className="absolute rounded-full bg-[#F3D9A0] motion-reduce:animate-none animate-twinkle"
          style={{
            top: d.top,
            left: d.left,
            width: d.size,
            height: d.size,
            animationDelay: d.delay,
            boxShadow: "0 0 6px 1px rgba(243, 217, 160, 0.8)",
          }}
        />
      ))}
    </div>
  );
}
