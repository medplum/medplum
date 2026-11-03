// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { randomUUID } from 'node:crypto';
import { expect, signIn, test } from '../fixtures/test';

test('Sign in', { tag: '@smoke' }, async ({ page, testProject }) => {
  await signIn(page, testProject.email, testProject.password);
  await expect(page.locator('div').filter({ hasText: /^Medplum Logo$/ })).toBeVisible();
});

test('Register new user and project', async ({ page }) => {
  await page.goto('/signin');
  await page.getByText('Register').click();
  await expect(page).toHaveURL(/\/register$/);

  await page.getByLabel('First name').fill('Test');
  await page.getByLabel('Last name').fill('User');
  await page.getByLabel('Email').fill(`e2e-${randomUUID()}@example.com`);
  await page.getByRole('textbox', { name: 'Password' }).fill(randomUUID());
  await page.getByRole('button', { name: 'Register Account' }).click();

  await page.getByLabel('Project Name').fill('Test Project');
  await page.getByRole('button', { name: 'Create Project' }).click();
  await expect(page).toHaveURL(/\/Patient\?/);
});
