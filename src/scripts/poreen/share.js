// Share cards: Boreen-style text, and a picture for Instagram or WhatsApp.
import { LAND_RINGS, LINE, CHECKPOINTS, locate, slice, describe } from '../../lib/poreen-route.js';
import { addDays, animal, fmtKm } from './util.js';

const NEON = '#b9ff1a';
const pageUrl = () => location.origin + location.pathname;

function lastWeekEmojis(p, today) {
  let s = '';
  for (let i = 6; i >= 0; i--) s += animal(p.days.get(addDays(today, -i)) || 0);
  return s;
}
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

export function shareText(model, key, day) {
  const p = key && model.byKey.get(key);
  if (p) {
    const stamps = p.stampIds.size;
    return [
      `Poreen ${day} 🐆`,
      `${p.name} · ${fmtKm(p.total)} km`,
      lastWeekEmojis(p, model.today),
      `📍 ${cap(describe(p.total))} · ${stamps}/${CHECKPOINTS.length} stamps`,
      pageUrl(),
    ].join('\n');
  }
  const c = model.club;
  const reached = c.km > 0 ? CHECKPOINTS.filter((x) => x.at <= c.where.lapKm).length : 0;
  return [
    `Poreen ${day} 🐆`,
    `The Panthers · ${fmtKm(c.km)} km together`,
    `✅ ${reached}/${CHECKPOINTS.length} checkpoints · next: ${c.where.nextCp.title} in ${fmtKm(c.where.toNextCp)} km`,
    pageUrl(),
  ].join('\n');
}

/* ---------- picture ---------- */

const W = 1080;
const H = 1350;

function projector(box) {
  const lat0 = 51.35;
  const lat1 = 55.45;
  const lng0 = -10.65;
  const lng1 = -5.35;
  const k = Math.cos(53.4 * (Math.PI / 180));
  const scale = Math.min(box.h / (lat1 - lat0), box.w / ((lng1 - lng0) * k));
  const w = (lng1 - lng0) * k * scale;
  const ox = box.x + (box.w - w) / 2;
  return ([lat, lng]) => [ox + (lng - lng0) * k * scale, box.y + (lat1 - lat) * scale];
}

function path(ctx, pts, proj, close) {
  ctx.beginPath();
  pts.forEach((p, i) => {
    const [x, y] = proj(p);
    if (i) ctx.lineTo(x, y);
    else ctx.moveTo(x, y);
  });
  if (close) ctx.closePath();
}

function fitText(ctx, text, maxW, size, weight, family) {
  let s = size;
  do {
    ctx.font = `${weight} ${s}px ${family}`;
    if (ctx.measureText(text).width <= maxW) break;
    s -= 4;
  } while (s > 20);
  return s;
}

export async function makeCard(model, key, day) {
  const D = '"Barlow Condensed", "Arial Narrow", sans-serif';
  const B = 'Inter, system-ui, sans-serif';
  try {
    await Promise.all([document.fonts.load(`800 100px "Barlow Condensed"`), document.fonts.load('700 30px Inter'), document.fonts.load('400 30px Inter')]);
  } catch {
    /* fall back to system fonts */
  }
  const p = key && model.byKey.get(key);
  const total = p ? p.total : model.club.km;
  const where = locate(total);

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  // Background and the club's neon slash.
  ctx.fillStyle = '#0a0a0a';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = NEON;
  ctx.beginPath();
  ctx.moveTo(880, 0);
  ctx.lineTo(W, 0);
  ctx.lineTo(W, 300);
  ctx.lineTo(782, 300);
  ctx.closePath();
  ctx.fill();

  // Header.
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#fff';
  ctx.font = `800 92px ${D}`;
  ctx.fillText('POREEN', 64, 128);
  const pw = ctx.measureText('POREEN ').width;
  ctx.fillStyle = NEON;
  ctx.fillText(day, 64 + pw, 128);
  ctx.fillStyle = '#9a9a9a';
  ctx.font = `700 24px ${B}`;
  ctx.letterSpacing = '5px';
  ctx.fillText('PORTERSTOWN PANTHERS · RUN IRELAND', 66, 172);
  ctx.letterSpacing = '0px';

  // Map.
  const proj = projector({ x: 60, y: 200, w: 960, h: 650 });
  ctx.fillStyle = '#1b1e17';
  ctx.strokeStyle = '#3a4130';
  ctx.lineWidth = 2;
  for (const ring of LAND_RINGS.ireland) {
    path(ctx, ring, proj, true);
    ctx.fill();
    ctx.stroke();
  }
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#4a4f44';
  ctx.lineWidth = 4;
  path(ctx, LINE, proj);
  ctx.stroke();
  if (total > 0) {
    ctx.strokeStyle = p ? '#fff' : NEON;
    ctx.lineWidth = 9;
    ctx.shadowColor = p ? 'rgba(255,255,255,.45)' : 'rgba(185,255,26,.7)';
    ctx.shadowBlur = 18;
    if (where.laps > 0) {
      ctx.globalAlpha = 0.35;
      path(ctx, LINE, proj);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    path(ctx, slice(0, where.lapKm), proj);
    ctx.stroke();
    ctx.shadowBlur = 0;
  }
  for (const c of CHECKPOINTS.slice(1, -1)) {
    const [x, y] = proj([c.lat, c.lng]);
    const reached = total > 0 && c.at <= where.lapKm;
    ctx.beginPath();
    ctx.arc(x, y, reached ? 8 : 6, 0, Math.PI * 2);
    ctx.fillStyle = reached ? NEON : '#0a0a0a';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = reached ? '#0a0a0a' : '#7a7a7a';
    ctx.stroke();
  }
  const [px, py] = proj([where.lat, where.lng]);
  ctx.beginPath();
  ctx.arc(px, py, 22, 0, Math.PI * 2);
  ctx.fillStyle = NEON;
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = '#0a0a0a';
  ctx.stroke();
  ctx.font = `28px ${B}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('🐆', px, py + 2);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';

  // Name, km and the week.
  const name = (p ? p.name : 'The Panthers').toUpperCase();
  ctx.fillStyle = '#fff';
  fitText(ctx, name, 952, 84, 800, D);
  ctx.fillText(name, 64, 962);
  ctx.fillStyle = NEON;
  ctx.font = `800 170px ${D}`;
  const kmText = fmtKm(total);
  ctx.fillText(kmText, 60, 1118);
  const kw = ctx.measureText(kmText).width;
  ctx.font = `800 64px ${D}`;
  ctx.fillText(p ? 'KM' : 'KM TOGETHER', 76 + kw, 1118);

  ctx.font = `56px ${B}`;
  if (p) ctx.fillText(lastWeekEmojis(p, model.today), 64, 1198);
  else {
    const reached = CHECKPOINTS.filter((c) => total > 0 && c.at <= where.lapKm).slice(-8);
    ctx.fillText(reached.map((c) => c.emoji).join(' ') || '🏁', 64, 1198);
  }

  ctx.fillStyle = '#cfcfcf';
  ctx.font = `400 32px ${B}`;
  const stamps = p ? p.stampIds.size : CHECKPOINTS.filter((c) => total > 0 && c.at <= where.lapKm).length;
  const line = `${cap(describe(total))} · ${stamps}/${CHECKPOINTS.length} ${p ? 'stamps' : 'checkpoints'}`;
  fitText(ctx, line, 952, 32, 400, B);
  ctx.fillText(line, 64, 1258);
  ctx.fillStyle = '#7a7a7a';
  ctx.font = `700 24px ${B}`;
  ctx.fillText(pageUrl().replace(/^https?:\/\//, ''), 64, 1308);

  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}

/** Share the picture where the device allows it, otherwise download it. */
export async function shareImage(blob, text, filename) {
  const file = new File([blob], filename, { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], text });
      return 'shared';
    } catch (err) {
      if (err?.name === 'AbortError') return 'cancelled';
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  return 'downloaded';
}
