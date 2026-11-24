// A short burst of confetti in club colours. Skipped when people prefer reduced motion.
import { reducedMotion } from './util.js';

export function confetti(canvas, { count = 140 } = {}) {
  if (reducedMotion() || !canvas) return;
  const ctx = canvas.getContext('2d');
  const dpr = Math.min(2, devicePixelRatio || 1);
  const w = (canvas.width = innerWidth * dpr);
  const h = (canvas.height = innerHeight * dpr);
  canvas.hidden = false;
  const colours = ['#b9ff1a', '#ffffff', '#b9ff1a', '#7a7a7a', '#0a0a0a'];
  const bits = Array.from({ length: count }, () => ({
    x: w / 2 + (Math.random() - 0.5) * w * 0.3,
    y: h * 0.35 + (Math.random() - 0.5) * h * 0.1,
    vx: (Math.random() - 0.5) * 22 * dpr,
    vy: (-Math.random() * 18 - 6) * dpr,
    r: Math.random() * Math.PI,
    vr: (Math.random() - 0.5) * 0.4,
    s: (6 + Math.random() * 8) * dpr,
    c: colours[(Math.random() * colours.length) | 0],
  }));
  const t0 = performance.now();
  const frame = (t) => {
    const age = (t - t0) / 1000;
    ctx.clearRect(0, 0, w, h);
    for (const b of bits) {
      b.vy += 0.55 * dpr;
      b.vx *= 0.985;
      b.x += b.vx;
      b.y += b.vy;
      b.r += b.vr;
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - age / 2.2);
      ctx.translate(b.x, b.y);
      ctx.rotate(b.r);
      ctx.fillStyle = b.c;
      ctx.fillRect(-b.s / 2, -b.s / 4, b.s, b.s / 2);
      ctx.restore();
    }
    if (age < 2.2) requestAnimationFrame(frame);
    else {
      ctx.clearRect(0, 0, w, h);
      canvas.hidden = true;
    }
  };
  requestAnimationFrame(frame);
}
