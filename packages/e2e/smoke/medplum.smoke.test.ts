// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';
import path from 'node:path';

test.describe('Medplum App Smoke Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:3000');
  });

  // TODO: Work around recaptcha
  test.skip('Register new user', async ({ page }) => {
    // We should automatically be redirected to the signin form
    await expect(page).toHaveURL(/^http:\/\/localhost:3000\/signin/);

    // Make sure the sign in form is there
    await expect(page.locator('form')).toContainText('Email *');
    await expect(page.getByRole('button', { name: 'Continue' })).toBeVisible();
    await expect(page.getByText('Register')).toBeVisible();

    // Navigate to sign up form
    await page.getByText('Register').click();
    await expect(page).toHaveURL('http://localhost:3000/register');

    // Fill out sign up form
    await page.getByPlaceholder('First name').fill('Test');
    await page.getByPlaceholder('Last name').fill('User');
    await page.getByPlaceholder('name@domain.com').fill('test@gmail.com');
    await page.getByLabel('Password *').fill('TestTest123%');
    await page.getByLabel('Remember me').check();
    await page.getByRole('button', { name: 'Create Account' }).click();

    await expect(page).toHaveURL('http://localhost:3000/register');
    await page.getByPlaceholder('My Project').fill('Test Project');
    await page.getByRole('button', { name: 'Create Project' }).click();
  });

  test('Sign in', async ({ page }) => {
    await signIn(page, 'admin@example.com', 'medplum_admin');
  });

  test('Create a patient', async ({ page }) => {
    await signIn(page, 'admin@example.com', 'medplum_admin');

    // Ensure navbar is open - if Patient link is not visible, click logo to open it
    const patientLink = page.getByRole('link', { name: 'Patient' });
    const isVisible = await patientLink.isVisible().catch(() => false);
    if (!isVisible) {
      await page.getByRole('button', { name: 'Medplum Logo' }).click();
      await expect(patientLink).toBeVisible();
    }
    await patientLink.click();
    await page.getByRole('button', { name: 'New...' }).click();
    await page.getByRole('button', { name: 'Add Name' }).click();
    await page.getByPlaceholder('Given').fill('Frodo');
    await page.getByPlaceholder('Family').fill('Baggins');
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await page.getByRole('button', { name: 'Create' }).click();
    await expect(page).toHaveURL(/^http:\/\/localhost:3000\/Patient\/[a-zA-Z0-9]+(?:-[a-zA-Z0-9]+)*$/);
    await expect(page.getByTestId('timeline-item').getByText('Frodo Baggins')).toBeVisible();
  });

  test('Search for patient via searchbar', async ({ page }) => {
    await signIn(page, 'admin@example.com', 'medplum_admin');

    // Click the Search button in the navbar to open Spotlight
    await page.getByRole('button', { name: 'Search' }).click();
    // Spotlight uses a different placeholder
    await page.getByPlaceholder('Start typing to search…').fill('Frodo Baggins');
    // Wait for the options dropdown to become visible
    await expect(page.getByText('FBFrodo Baggins').first()).toBeVisible({ timeout: 10000 });
    await page.getByText('FBFrodo Baggins').first().click();

    await page.getByTestId('timeline-item').getByText('Frodo Baggins').click();
  });

  test('Search for patient via permalink', async ({ page }) => {
    await signIn(page, 'admin@example.com', 'medplum_admin');

    await page.goto('http://localhost:3000/Patient?name=Frodo&_sort=-_lastUpdated');
    await expect(page.getByTestId('search-control-row').first().locator('div')).toContainText('Frodo Baggins');
  });

  test('Upload patient profile photo', async ({ page }) => {
    await signIn(page, 'admin@example.com', 'medplum_admin');

    await page.goto('http://localhost:3000/Patient?name=Frodo&_sort=-_lastUpdated');
    await expect(page.getByTestId('search-control-row').first().locator('div')).toContainText('Frodo Baggins');

    // Click on patient
    await page.getByTestId('search-control-row').first().locator('div').click();

    // Edit and upload image
    await page.getByRole('tab', { name: 'Edit' }).click();
    await expect(page.getByText('An identifier for this patient.', { exact: true })).toBeVisible();
    await page.getByTestId('upload-file-input').setInputFiles(path.resolve('./content/frodo_baggins.png'));
    await expect(page.getByTestId('attachment-image')).toBeVisible();
    await page.getByRole('button', { name: 'Update' }).click();

    await page.getByRole('tab', { name: 'Details' }).click();
    await expect(page.getByTestId('attachment-details')).toBeVisible();
    await expect(page.getByTestId('attachment-details')).toContainText('frodo_baggins.png');
  });
});

async function signIn(page: Page, email: string, password: string): Promise<void> {
  // We should automatically be redirected to the signin form
  await expect(page).toHaveURL(/^http:\/\/localhost:3000\/signin/);

  // Make sure the sign in form is there
  await expect(page.locator('form')).toContainText('Email *');
  await expect(page.getByRole('button', { name: 'Continue' })).toBeVisible();
  await expect(page.getByText('Register')).toBeVisible();

  // Fill out sign in form
  await page.getByPlaceholder('name@domain.com').fill(email);
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByLabel('Password *').fill(password);
  await page.getByLabel('Remember me').check();
  await page.getByRole('button', { name: 'Sign In' }).click();

  // Make sure we ended up on the right page
  await expect(page).toHaveURL(/^http:\/\/localhost:3000\/Patient\?/);
  await expect(page.locator('div').filter({ hasText: /^Medplum Logo$/ })).toBeVisible();
}
