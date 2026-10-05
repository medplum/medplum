// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
/// <reference lib="dom" />
import type { Locator, Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const OUTPUT_DIR = process.env.SCREENSHOT_DIR ?? join(import.meta.dirname, '../../docs/static/img');
const WEBP_QUALITY = 0.9;

/**
 * Captures a screenshot of a page or element and writes it as WebP under the docs image directory.
 * @param target - The page or element to capture.
 * @param name - Output path relative to the image directory, without extension.
 */
export async function capture(target: Page | Locator, name: string): Promise<void> {
  const page = 'page' in target ? target.page() : target;
  const png = await target.screenshot({ animations: 'disabled', caret: 'hide' });

  // Chromium can encode WebP natively, which avoids an image processing dependency
  const webpBase64 = await page.evaluate(
    async ({ data, quality }) => {
      const blob = await (await fetch(`data:image/png;base64,${data}`)).blob();
      const bitmap = await createImageBitmap(blob);
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      canvas.getContext('2d')?.drawImage(bitmap, 0, 0);
      const webp = await canvas.convertToBlob({ type: 'image/webp', quality });
      const bytes = new Uint8Array(await webp.arrayBuffer());
      let binary = '';
      for (const byte of bytes) {
        binary += String.fromCharCode(byte);
      }
      return btoa(binary);
    },
    { data: png.toString('base64'), quality: WEBP_QUALITY }
  );

  const outputPath = join(OUTPUT_DIR, `${name}.webp`);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, Buffer.from(webpBase64, 'base64'));
}
