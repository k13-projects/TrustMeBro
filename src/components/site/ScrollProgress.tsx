// Pure-CSS scroll progress bar. The prior implementation used motion's
// useScroll + useSpring, which allocated a spring and ran a per-frame
// transform on every page — visible in profiler as a constant 0.5–1.5ms
// hit at the top of every scroll task. The CSS `animation-timeline:
// scroll(root block)` driver fires entirely on the compositor with no JS.
// Safari stable doesn't support scroll-timeline yet — the @supports gate
// in globals.css means the bar just doesn't render there, which is
// graceful degradation, not a regression. No client component, no hooks.
export function ScrollProgress() {
  return <div aria-hidden className="scroll-progress" />;
}
