// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { CARD_LAYOUT, renderSmartHealthLinkCard } from './SmartHealthLinkCard';

const { paddingTop, lineHeight, qrGap, qrSize, logoGap, logoSize, paddingBottom } = CARD_LAYOUT;

interface FakeImage {
  src: string;
  width: number;
  height: number;
  crossOrigin?: string;
  onload?: () => void;
  onerror?: () => void;
}

describe('renderSmartHealthLinkCard', () => {
  let ctx: Record<string, any>;
  let failingSrcs: string[];

  beforeEach(() => {
    failingSrcs = [];
    ctx = {
      scale: vi.fn(),
      fillRect: vi.fn(),
      fillText: vi.fn(),
      drawImage: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      translate: vi.fn(),
      fill: vi.fn(),
      measureText: vi.fn((text: string) => ({ width: text.length * 7 })),
    };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
    HTMLCanvasElement.prototype.toBlob = function (callback: BlobCallback) {
      callback(new Blob(['png'], { type: 'image/png' }));
    };
    vi.stubGlobal(
      'Image',
      class implements FakeImage {
        width = 64;
        height = 32;
        crossOrigin?: string;
        onload?: () => void;
        onerror?: () => void;
        private _src = '';
        get src(): string {
          return this._src;
        }
        set src(value: string) {
          this._src = value;
          setTimeout(() => (failingSrcs.includes(value) ? this.onerror?.() : this.onload?.()));
        }
      }
    );
    vi.stubGlobal('Path2D', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  test('Draws the label, expiration, QR code, and Medplum logo', async () => {
    const blob = await renderSmartHealthLinkCard({
      label: 'Frodo Baggins’ Health Records',
      expires: 'Expires 10/6/2026, 3:32 PM',
      qrCodeDataUrl: 'data:image/png;base64,qr',
    });

    expect(blob?.type).toBe('image/png');
    expect(ctx.fillText).toHaveBeenCalledWith('Frodo Baggins’ Health Records', 150, 34);
    expect(ctx.fillText).toHaveBeenCalledWith('Expires 10/6/2026, 3:32 PM', 150, 54);
    expect(ctx.drawImage).toHaveBeenCalledWith(
      expect.objectContaining({ src: 'data:image/png;base64,qr' }),
      12,
      paddingTop + 2 * lineHeight + qrGap,
      qrSize,
      qrSize
    );
    expect(ctx.fill).toHaveBeenCalledTimes(1);
  });

  test('Wraps a long label and grows the card', async () => {
    const canvas = document.createElement('canvas');
    vi.spyOn(document, 'createElement').mockReturnValue(canvas);

    await renderSmartHealthLinkCard({
      label: 'Bilbo Baggins of Bag End, Hobbiton, the Shire Health Records',
      qrCodeDataUrl: 'data:image/png;base64,qr',
    });

    expect(ctx.fillText).toHaveBeenCalledTimes(2);
    const qrTop = paddingTop + 2 * lineHeight + qrGap;
    expect(ctx.drawImage).toHaveBeenCalledWith(expect.anything(), 12, qrTop, qrSize, qrSize);
    expect(canvas.height).toBe((qrTop + qrSize + logoGap + logoSize + paddingBottom) * 3);
  });

  test('Draws a custom logo, fitted to the logo slot', async () => {
    await renderSmartHealthLinkCard({
      label: 'Records',
      qrCodeDataUrl: 'data:image/png;base64,qr',
      logoUrl: 'https://example.com/logo.png',
    });

    expect(ctx.drawImage).toHaveBeenCalledWith(
      expect.objectContaining({ src: 'https://example.com/logo.png' }),
      134,
      paddingTop + lineHeight + qrGap + qrSize + logoGap + 8,
      32,
      16
    );
    expect(ctx.fill).not.toHaveBeenCalled();
  });

  test('Falls back to the Medplum logo when the custom logo fails to load', async () => {
    failingSrcs.push('https://example.com/missing.png');

    await renderSmartHealthLinkCard({
      label: 'Records',
      qrCodeDataUrl: 'data:image/png;base64,qr',
      logoUrl: 'https://example.com/missing.png',
    });

    expect(ctx.fill).toHaveBeenCalledTimes(1);
  });

  test('Returns undefined without a 2D canvas', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);

    expect(
      await renderSmartHealthLinkCard({ label: 'Records', qrCodeDataUrl: 'data:image/png;base64,qr' })
    ).toBeUndefined();
  });
});
