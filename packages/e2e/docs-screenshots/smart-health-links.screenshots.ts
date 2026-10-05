// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { expect, test } from '@playwright/test';
import { generateSampleSmartHealthLink } from './smart-health-links.fixture';
import { capture } from './utils';

const SERVER_BASE_URL = process.env.MEDPLUM_BASE_URL ?? 'http://localhost:8103/';
const SOURCE_EMAIL = process.env.SOURCE_EMAIL ?? 'admin@example.com';
const SOURCE_PASSWORD = process.env.SOURCE_PASSWORD ?? 'medplum_admin';
const PREFIX = 'smart-health-links/medplum-smart-health-links';

test('SMART Health Links guide', async ({ page }) => {
  // The super admin project stands in for the patient-facing app that shares the link
  const shlink = await generateSampleSmartHealthLink(SERVER_BASE_URL, SOURCE_EMAIL, SOURCE_PASSWORD);

  // Step 3: Register for Medplum
  await page.goto('/register');
  await page.getByLabel('First name').fill('Alice');
  await page.getByLabel('Last name').fill('Smith');
  await page.getByLabel('Email').fill('alice.smith@example.com');
  await page.getByRole('textbox', { name: 'Password' }).fill('correct-horse-battery-staple');
  await capture(page, `${PREFIX}-register`);

  // Every run registers a fresh account, so swap in a unique email after the screenshot
  await page.getByLabel('Email').fill(`alice.smith+${Date.now()}@example.com`);
  await page.getByRole('button', { name: 'Register Account' }).click();

  await page.getByLabel('Project Name').fill('My Clinic');
  await capture(page, `${PREFIX}-create-project`);
  await page.getByRole('button', { name: 'Create Project' }).click();
  await expect(page.getByText('Get Started with Medplum Provider')).toBeVisible();

  // Step 4: Import the SMART Health Link
  await page.keyboard.press('ControlOrMeta+K');
  const spotlightAction = page.getByText('Import from SMART Health Link or Card');
  await expect(spotlightAction).toBeVisible();
  await capture(page, `${PREFIX}-spotlight`);
  await spotlightAction.click();

  const modal = page.getByRole('dialog', { name: 'Import from SMART Health Card or Link' });
  await modal.getByRole('textbox', { name: 'SMART Health Link' }).fill(shlink);
  await capture(modal, `${PREFIX}-open-link`);
  await modal.getByRole('button', { name: 'Open SMART Health Link' }).click();

  // Step 5: Resolve Patient Identity
  await expect(modal.getByRole('radiogroup', { name: 'Select import destination' })).toBeVisible();
  await capture(modal, `${PREFIX}-select-patient`);
  await modal.getByRole('button', { name: 'Continue' }).click();

  // Step 6: Review Resources
  const importButton = modal.getByRole('button', { name: 'Create Maria Garcia & Import Records' });
  await expect(importButton).toBeVisible();
  await capture(modal, `${PREFIX}-import-records`);
  await importButton.click();

  // Step 8: Verify the Results
  await expect(page).toHaveURL(/\/Patient\/[\w-]+\/timeline/);
  await expect(page.getByText('Allergy to penicillin')).toBeVisible();
  await expect(page.getByText('Hypertension')).toBeVisible();
  await expect(page.getByText('Created')).toBeVisible();
  await capture(page, `${PREFIX}-results`);
});
