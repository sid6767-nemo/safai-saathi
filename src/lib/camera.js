// Live camera only. Photos come from a getUserMedia video frame drawn to a canvas: there is no
// file input or gallery path anywhere in the app (scripts/check.mjs enforces this).

export class CameraError extends Error {
  constructor(kind) {
    super(`Camera error: ${kind}`);
    this.kind = kind;
  }
}

// Copy for each kind lives in the language files as cam.<kind>.title / .body / .fix
const ERROR_KINDS = {
  NotAllowedError: 'denied',
  SecurityError: 'denied',
  NotFoundError: 'notfound',
  OverconstrainedError: 'notfound',
  NotReadableError: 'inuse',
  AbortError: 'inuse',
};

// Starts the rear camera (front on laptops) in `video`. Resolves to a stop function.
export async function startCamera(video) {
  if (!window.isSecureContext) throw new CameraError('insecure');
  if (!navigator.mediaDevices?.getUserMedia) throw new CameraError('unsupported');
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
    });
  } catch (err) {
    throw new CameraError(ERROR_KINDS[err.name] ?? 'unknown');
  }
  video.muted = true;
  video.playsInline = true;
  video.srcObject = stream;
  if (video.readyState < 1) await new Promise((r) => video.addEventListener('loadedmetadata', r, { once: true }));
  await video.play().catch(() => {});
  return () => {
    for (const track of stream.getTracks()) track.stop();
    video.srcObject = null;
  };
}

export function grabFrame(video, maxSide = 1600) {
  const scale = Math.min(1, maxSide / Math.max(video.videoWidth, video.videoHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(video.videoWidth * scale);
  canvas.height = Math.round(video.videoHeight * scale);
  canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas;
}

export const formatCode = (code) => `${code.slice(0, 3)} ${code.slice(3)}`;

const MONO = '"IBM Plex Mono", ui-monospace, Menlo, monospace';

function hazardEdge(ctx, y, width, height) {
  ctx.save();
  ctx.fillStyle = '#FFC20E';
  ctx.fillRect(0, y, width, height);
  ctx.fillStyle = '#15171A';
  const step = height * 2;
  for (let x = -height; x < width + height; x += step * 2) {
    ctx.beginPath();
    ctx.moveTo(x, y + height);
    ctx.lineTo(x + step, y + height);
    ctx.lineTo(x + step + height, y);
    ctx.lineTo(x + height, y);
    ctx.fill();
  }
  ctx.restore();
}

// Burns the evidence into the pixels: a strip of timestamp/GPS lines along the bottom and, for
// proof photos, the one-time job code in a yellow plate at top-left (the same plate the
// viewfinder shows). Once drawn it can't be separated from the photo.
export async function stampPhoto(canvas, { code, lines }) {
  try {
    await Promise.all([document.fonts.load(`600 40px ${MONO}`), document.fonts.load(`500 20px ${MONO}`)]);
  } catch {
    // Falls back to the system monospace font.
  }
  const ctx = canvas.getContext('2d');
  const { width: w, height: h } = canvas;
  const unit = Math.min(w, h);

  const fontSize = Math.max(12, Math.round(unit * 0.032));
  const lineHeight = Math.round(fontSize * 1.35);
  const pad = Math.round(fontSize * 0.8);
  const edge = Math.max(4, Math.round(unit * 0.01));
  const stripHeight = edge + pad * 2 + lineHeight * lines.length;
  const stripTop = h - stripHeight;

  ctx.fillStyle = 'rgba(21, 23, 26, 0.88)';
  ctx.fillRect(0, stripTop, w, stripHeight);
  hazardEdge(ctx, stripTop, w, edge);
  ctx.fillStyle = '#F3F4F1';
  ctx.textBaseline = 'top';
  ctx.font = `500 ${fontSize}px ${MONO}`;
  lines.forEach((line, i) => ctx.fillText(line, pad, stripTop + edge + pad + i * lineHeight));

  if (code) {
    const size = Math.round(unit * 0.09);
    const margin = Math.round(unit * 0.035);
    const labelSize = Math.round(size * 0.3);
    const text = formatCode(code);
    ctx.font = `600 ${size}px ${MONO}`;
    const boxWidth = ctx.measureText(text).width + size * 0.6;
    const boxHeight = size * 1.15 + labelSize * 1.5;
    ctx.fillStyle = '#FFC20E';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(margin, margin, boxWidth, boxHeight, size * 0.12);
    else ctx.rect(margin, margin, boxWidth, boxHeight);
    ctx.fill();
    ctx.fillStyle = '#15171A';
    ctx.font = `500 ${labelSize}px ${MONO}`;
    ctx.fillText('Job code', margin + size * 0.3, margin + labelSize * 0.55);
    ctx.font = `600 ${size}px ${MONO}`;
    ctx.fillText(text, margin + size * 0.3, margin + labelSize * 1.5 + size * 0.05);
  }
}

export const canvasToBlob = (canvas, quality = 0.86) =>
  new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not encode the photo'))), 'image/jpeg', quality),
  );

// JPEG data URL no larger than `maxSide` on its long edge: what gets sent to the AI.
export function scaledDataUrl(source, maxSide = 1024) {
  const sw = source.naturalWidth || source.width;
  const sh = source.naturalHeight || source.height;
  const scale = Math.min(1, maxSide / Math.max(sw, sh));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(sw * scale);
  canvas.height = Math.round(sh * scale);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.82);
}

export async function srcToDataUrl(src, maxSide = 1024) {
  const img = new Image();
  img.src = src;
  await img.decode();
  return scaledDataUrl(img, maxSide);
}
