// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MEDPLUM_LOGO_COLOR, MEDPLUM_LOGO_PATH } from '../Logo/Logo.utils';

export const CARD_LAYOUT = {
  width: 300,
  paddingX: 24,
  paddingTop: 24,
  logoSize: 32,
  logoGap: 20,
  lineHeight: 18,
  qrGap: 6,
  qrSize: 276,
  expiresGap: 6,
  paddingBottom: 20,
  labelColor: '#000000',
  expiresColor: '#868e96',
} as const;

const {
  width: WIDTH,
  paddingX: PADDING_X,
  paddingTop: PADDING_TOP,
  logoSize: LOGO_SIZE,
  logoGap: LOGO_GAP,
  lineHeight: LINE_HEIGHT,
  qrGap: QR_GAP,
  qrSize: QR_SIZE,
  expiresGap: EXPIRES_GAP,
  paddingBottom: PADDING_BOTTOM,
} = CARD_LAYOUT;
const SCALE = 3;
const LOGO_VIEWBOX = 180;

export function getCardHeight(labelLines: number, expiresLines: number): number {
  const expiresHeight = expiresLines ? EXPIRES_GAP + expiresLines * LINE_HEIGHT : 0;
  return (
    PADDING_TOP + LOGO_SIZE + LOGO_GAP + labelLines * LINE_HEIGHT + QR_GAP + QR_SIZE + expiresHeight + PADDING_BOTTOM
  );
}

export interface SmartHealthLinkCardOptions {
  readonly label: string;
  readonly expires?: string;
  readonly qrCodeDataUrl: string;
  readonly logoUrl?: string;
  readonly fontFamily?: string;
}

export async function renderSmartHealthLinkCard(options: SmartHealthLinkCardOptions): Promise<Blob | undefined> {
  const { label, expires, qrCodeDataUrl, logoUrl, fontFamily = 'system-ui, sans-serif' } = options;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return undefined;
  }

  const [qrCode, logo] = await Promise.all([
    loadImage(qrCodeDataUrl),
    logoUrl ? loadImage(logoUrl).catch(() => undefined) : undefined,
  ]);

  const labelFont = `800 14px ${fontFamily}`;
  const expiresFont = `400 14px ${fontFamily}`;
  const maxTextWidth = WIDTH - 2 * PADDING_X;
  ctx.font = labelFont;
  const labelLines = balanceText(ctx, label, maxTextWidth);
  ctx.font = expiresFont;
  const expiresLines = expires ? wrapText(ctx, expires, maxTextWidth) : [];
  const labelTop = PADDING_TOP + LOGO_SIZE + LOGO_GAP;
  const qrTop = labelTop + labelLines.length * LINE_HEIGHT + QR_GAP;
  const expiresTop = qrTop + QR_SIZE + EXPIRES_GAP;
  const height = getCardHeight(labelLines.length, expiresLines.length);

  canvas.width = WIDTH * SCALE;
  canvas.height = height * SCALE;
  ctx.scale(SCALE, SCALE);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, WIDTH, height);

  if (logo) {
    const fit = Math.min(LOGO_SIZE / logo.width, LOGO_SIZE / logo.height);
    const w = logo.width * fit;
    const h = logo.height * fit;
    ctx.drawImage(logo, (WIDTH - w) / 2, PADDING_TOP + (LOGO_SIZE - h) / 2, w, h);
  } else {
    ctx.save();
    ctx.translate((WIDTH - LOGO_SIZE) / 2, PADDING_TOP);
    ctx.scale(LOGO_SIZE / LOGO_VIEWBOX, LOGO_SIZE / LOGO_VIEWBOX);
    ctx.fillStyle = MEDPLUM_LOGO_COLOR;
    ctx.fill(new Path2D(MEDPLUM_LOGO_PATH));
    ctx.restore();
  }

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = labelFont;
  ctx.fillStyle = CARD_LAYOUT.labelColor;
  labelLines.forEach((line, i) => ctx.fillText(line, WIDTH / 2, labelTop + LINE_HEIGHT * (i + 0.5)));

  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(qrCode, (WIDTH - QR_SIZE) / 2, qrTop, QR_SIZE, QR_SIZE);
  ctx.imageSmoothingEnabled = true;

  ctx.font = expiresFont;
  ctx.fillStyle = CARD_LAYOUT.expiresColor;
  expiresLines.forEach((line, i) => ctx.fillText(line, WIDTH / 2, expiresTop + LINE_HEIGHT * (i + 0.5)));

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob ?? undefined), 'image/png');
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Failed to load image: ${src}`));
    image.src = src;
  });
}

function balanceText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lineCount = wrapText(ctx, text, maxWidth).length;
  let low = 0;
  let high = maxWidth;
  while (high - low > 1) {
    const mid = Math.floor((low + high) / 2);
    if (wrapText(ctx, text, mid).length > lineCount) {
      low = mid;
    } else {
      high = mid;
    }
  }
  return wrapText(ctx, text, high);
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(candidate).width > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  lines.push(line);
  return lines;
}
