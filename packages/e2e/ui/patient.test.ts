// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Patient } from '@medplum/fhirtypes';
import { join } from 'node:path';
import type { TestProject } from '../fixtures/test';
import { expect, signIn, test } from '../fixtures/test';

test('Create a patient', { tag: '@smoke' }, async ({ page, testProject }) => {
  await signIn(page, testProject.email, testProject.password);

  await page.getByRole('button', { name: 'Medplum Logo' }).click();
  await page.getByRole('link', { name: 'Patient' }).click();
  await page.getByRole('button', { name: 'New Patient' }).click();
  await page.getByRole('button', { name: 'Add Name' }).click();
  await page.getByPlaceholder('Given').fill('Frodo');
  await page.getByPlaceholder('Family').fill('Baggins');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await page.getByRole('button', { name: 'Create' }).click();
  await expect(page).toHaveURL(/\/Patient\/[\w-]+$/);
  await expect(page.getByTestId('timeline-item').getByText('Frodo Baggins')).toBeVisible();
});

test('Search for patient via searchbar', async ({ page, testProject }) => {
  await createFrodo(testProject);
  await signIn(page, testProject.email, testProject.password);

  await page.getByPlaceholder('Search').fill('Frodo Baggins');
  await expect(page.getByTestId('options')).toBeVisible();
  await page.getByText('FBFrodo Baggins').first().click();
  await expect(page.getByTestId('timeline-item').getByText('Frodo Baggins')).toBeVisible();
});

test('Search for patient via permalink', async ({ page, testProject }) => {
  await createFrodo(testProject);
  await signIn(page, testProject.email, testProject.password);

  await page.goto('/Patient?name=Frodo&_sort=-_lastUpdated');
  await expect(page.getByTestId('search-control-row').first()).toContainText('Frodo Baggins');
});

test('Upload patient profile photo', async ({ page, testProject }) => {
  const patient = await createFrodo(testProject);
  await signIn(page, testProject.email, testProject.password);

  await page.goto(`/Patient/${patient.id}`);
  await page.getByRole('tab', { name: 'Edit' }).click();
  await expect(page.getByText('An identifier for this patient.', { exact: true })).toBeVisible();
  await page
    .getByTestId('upload-file-input')
    .setInputFiles(join(import.meta.dirname, '../content/frodo_baggins.png'));
  await expect(page.getByTestId('attachment-image')).toBeVisible();
  await page.getByRole('button', { name: 'Update' }).click();

  await page.getByRole('tab', { name: 'Details' }).click();
  await expect(page.getByTestId('attachment-details')).toContainText('frodo_baggins.png');
});

function createFrodo({ medplum }: TestProject): Promise<Patient> {
  return medplum.createResource<Patient>({ resourceType: 'Patient', name: [{ given: ['Frodo'], family: 'Baggins' }] });
}
