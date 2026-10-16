// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
/// <reference lib="dom" />
import { convertToTransactionBundle, MedplumClient } from '@medplum/core';
import type { Bundle, Parameters } from '@medplum/fhirtypes';
import type { Locator, Page } from '@playwright/test';
import { expect, test } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const SERVER_BASE_URL = 'http://localhost:8103/';
const IMG_DIR = process.env.SCREENSHOT_DIR ?? join(import.meta.dirname, '../../docs/static/img/smart-health-links');
const SAMPLE_PATIENT = join(
  import.meta.dirname,
  '../../../examples/medplum-provider/src/data/patient-david-james-williams.json'
);

test.use({ baseURL: 'http://localhost:3001', viewport: { width: 1280, height: 1000 }, deviceScaleFactor: 2 });

test('SMART Health Links guide screenshots', async ({ page }) => {
  const shlink = await generateSmartHealthLink();

  // Step 3: Register for Medplum
  await page.goto('/register');
  await page.getByLabel('First name').fill('Alice');
  await page.getByLabel('Last name').fill('Smith');
  await page.getByLabel('Email').fill('alice.smith@example.com');
  await page.getByRole('textbox', { name: 'Password' }).fill('correct-horse-battery-staple');
  await capture(page, 'register');
  // Swap in a unique email after the screenshot so every run registers a fresh account
  await page.getByLabel('Email').fill(`alice.smith+${Date.now()}@example.com`);
  await page.getByRole('button', { name: 'Register Account' }).click();

  await page.getByLabel('Project Name').fill('My Clinic');
  await capture(page, 'create-project');
  await page.getByRole('button', { name: 'Create Project' }).click();
  await expect(page.getByText('Get Started with Medplum Provider')).toBeVisible();

  // Step 4: Import the SMART Health Link
  await page.keyboard.press('ControlOrMeta+K');
  const action = page.getByText('Import from SMART Health Link or Card');
  await expect(action).toBeVisible();
  await capture(page, 'spotlight');
  await action.click();

  const modal = page.getByRole('dialog', { name: 'Import from SMART Health Card or Link' });
  await modal.getByRole('textbox', { name: 'SMART Health Link' }).fill(shlink);
  await capture(modal, 'open-link');
  await modal.getByRole('button', { name: 'Open SMART Health Link' }).click();

  // Step 5: Resolve Patient Identity
  await expect(modal.getByRole('radiogroup', { name: 'Select import destination' })).toBeVisible();
  await capture(modal, 'select-patient');
  await modal.getByRole('button', { name: 'Continue' }).click();

  // Steps 6 and 7: Review and import resources
  const importButton = modal.getByRole('button', { name: 'Create David James Williams & Import Records' });
  await expect(importButton).toBeVisible();
  await capture(modal, 'import-records');
  await importButton.click();

  // Step 8: Verify the Results
  await expect(page).toHaveURL(/\/Patient\/[\w-]+\/timeline/);
  await expect(page.getByText('Prediabetes')).toBeVisible();
  await expect(page.getByText('Created')).toBeVisible();
  await capture(page, 'results');
});

/**
 * Imports the Provider sample patient into the super admin project, which stands in for the
 * patient-facing app, and shares it as a SMART Health Link.
 * @returns The `shlink:/` URL.
 */
async function generateSmartHealthLink(): Promise<string> {
  const medplum = new MedplumClient({ baseUrl: SERVER_BASE_URL });
  const login = await medplum.startLogin({ email: 'admin@example.com', password: 'medplum_admin' });
  await medplum.processCode(login.code as string);

  const sample = JSON.parse(readFileSync(SAMPLE_PATIENT, 'utf8')) as Bundle;
  const transaction = convertToTransactionBundle(sample);
  const result = await medplum.executeBatch(transaction);
  const patientIndex = transaction.entry?.findIndex((e) => e.resource?.resourceType === 'Patient') ?? -1;
  const patientId = result.entry?.[patientIndex]?.response?.location?.split('/')[1] as string;

  const params = await medplum.post<Parameters>(medplum.fhirUrl('Patient', patientId, '$generate-smart-health-link'), {
    resourceType: 'Parameters',
  });
  return params.parameter?.find((p) => p.name === 'shlink')?.valueString as string;
}

/**
 * Screenshots a page or element into the docs image directory as WebP.
 * @param target - The page or element to capture.
 * @param name - Image name suffix, e.g. `register` for `medplum-smart-health-links-register.webp`.
 */
async function capture(target: Page | Locator, name: string): Promise<void> {
  const page = 'page' in target ? target.page() : target;
  const png = await target.screenshot({ animations: 'disabled', caret: 'hide' });
  // Playwright only writes PNG and JPEG; Chromium's canvas encodes WebP without an extra dependency
  const webp = await page.evaluate(async (base64) => {
    const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${base64}`)).blob());
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0);
    const blob = await canvas.convertToBlob({ type: 'image/webp', quality: 0.9 });
    return Array.from(new Uint8Array(await blob.arrayBuffer()));
  }, png.toString('base64'));
  writeFileSync(join(IMG_DIR, `medplum-smart-health-links-${name}.webp`), Buffer.from(webp));
}
