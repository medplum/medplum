// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MEDPLUM_LOGO_COLOR, MEDPLUM_LOGO_PATH } from '../Logo/Logo.utils';

export const CARD_LAYOUT = {
  width: 300,
  paddingX: 16,
  paddingTop: 24,
  lineHeight: 20,
  qrSize: 276,
  qrGap: 8,
  logoSize: 32,
  logoGap: 12,
  paddingBottom: 28,
  labelColor: '#000000',
  expiresColor: '#868e96',
} as const;

const {
  width: WIDTH,
  paddingX: PADDING_X,
  paddingTop: PADDING_TOP,
  lineHeight: LINE_HEIGHT,
  qrSize: QR_SIZE,
  qrGap: QR_GAP,
  logoSize: LOGO_SIZE,
  logoGap: LOGO_GAP,
  paddingBottom: PADDING_BOTTOM,
} = CARD_LAYOUT;
const SCALE = 3;
const LOGO_VIEWBOX = 180;

export function getCardHeight(textLines: number): number {
  return PADDING_TOP + textLines * LINE_HEIGHT + QR_GAP + QR_SIZE + LOGO_GAP + LOGO_SIZE + PADDING_BOTTOM;
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

  const titleFont = `800 14px ${fontFamily}`;
  ctx.font = titleFont;
  const titleLines = wrapText(ctx, label, WIDTH - 2 * PADDING_X);
  const textLines = titleLines.length + (expires ? 1 : 0);
  const qrTop = PADDING_TOP + textLines * LINE_HEIGHT + QR_GAP;
  const logoTop = qrTop + QR_SIZE + LOGO_GAP;
  const height = getCardHeight(textLines);

  canvas.width = WIDTH * SCALE;
  canvas.height = height * SCALE;
  ctx.scale(SCALE, SCALE);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, WIDTH, height);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = titleFont;
  ctx.fillStyle = CARD_LAYOUT.labelColor;
  titleLines.forEach((line, i) => ctx.fillText(line, WIDTH / 2, PADDING_TOP + LINE_HEIGHT * (i + 0.5)));
  if (expires) {
    ctx.font = `400 14px ${fontFamily}`;
    ctx.fillStyle = CARD_LAYOUT.expiresColor;
    ctx.fillText(expires, WIDTH / 2, PADDING_TOP + LINE_HEIGHT * (titleLines.length + 0.5));
  }

  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(qrCode, (WIDTH - QR_SIZE) / 2, qrTop, QR_SIZE, QR_SIZE);
  ctx.imageSmoothingEnabled = true;

  if (logo) {
    const fit = Math.min(LOGO_SIZE / logo.width, LOGO_SIZE / logo.height);
    const w = logo.width * fit;
    const h = logo.height * fit;
    ctx.drawImage(logo, (WIDTH - w) / 2, logoTop + (LOGO_SIZE - h) / 2, w, h);
  } else {
    ctx.save();
    ctx.translate((WIDTH - LOGO_SIZE) / 2, logoTop);
    ctx.scale(LOGO_SIZE / LOGO_VIEWBOX, LOGO_SIZE / LOGO_VIEWBOX);
    ctx.fillStyle = MEDPLUM_LOGO_COLOR;
    ctx.fill(new Path2D(MEDPLUM_LOGO_PATH));
    ctx.restore();
  }

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
