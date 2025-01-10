import { expect, test } from '@playwright/test';

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
    await expect(page.getByRole('button', { name: 'Next' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Register' })).toBeVisible();

    // Navigate to sign up form
    await page.getByRole('button', { name: 'Register' }).click();
    await expect(page).toHaveURL('http://localhost:3000/register');

    // Fill out sign up form
    await page.getByPlaceholder('First name').fill('Test');
    await page.getByPlaceholder('Last name').fill('User');
    await page.getByPlaceholder('name@domain.com').fill('test@gmail.com');
    await page.getByLabel('Password *').fill('TestTest123%');
    await page.getByLabel('Remember me').check();
    await page.getByRole('button', { name: 'Create account' }).click();

    await expect(page).toHaveURL('http://localhost:3000/register');
    await page.getByPlaceholder('My Project').fill('Test Project');
    await page.getByRole('button', { name: 'Create project' }).click();
  });

  test('Sign in', async ({ page }) => {
    // We should automatically be redirected to the signin form
    await expect(page).toHaveURL(/^http:\/\/localhost:3000\/signin/);

    // Make sure the sign in form is there
    await expect(page.locator('form')).toContainText('Email *');
    await expect(page.getByRole('button', { name: 'Next' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Register' })).toBeVisible();

    // Fill out sign in form
    await page.getByPlaceholder('name@domain.com').fill('admin@example.com');
    await page.getByRole('button', { name: 'Next' }).click();
    await page.getByLabel('Password *').fill('medplum_admin');
    await page.getByLabel('Remember me').check();
    await page.getByRole('button', { name: 'Sign in' }).click();

    // Make sure we ended up on the right page
    await expect(page).toHaveURL(/^http:\/\/localhost:3000\/Patient\?/);
    await expect(page.locator('div').filter({ hasText: /^Medplum Logo$/ })).toBeVisible();
  });

  test('Create a patient', async ({ page }) => {
    await page.getByRole('button', { name: 'Medplum Logo' }).click();
    await page.getByRole('link', { name: 'Patient' }).click();
    await page.getByRole('button', { name: 'New...' }).click();
    await page.getByRole('button', { name: 'Add Name' }).click();
    await page.getByPlaceholder('Given').fill('Frodo');
    await page.getByPlaceholder('Family').fill('Baggins');
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await page.getByRole('button', { name: 'Create' }).click();
    await expect(
      page
        .locator('div')
        .filter({ hasText: /^NameFrodo Baggins$/ })
        .nth(3)
    ).toBeVisible();
    await expect(page.getByText('Frodo Baggins')).toBeVisible();
    await expect(page.getByTestId('search-control-row').locator('div')).toContainText('Frodo Baggins');
  });

  test('Search for patient via searchbar', async ({ page }) => {
    await page.getByPlaceholder('Search').fill('Frodo Baggins');
    await page.getByPlaceholder('Search').press('Enter');
    await page.getByText('FBFrodo Baggins').click();

    await expect(page.getByText('Frodo Baggins')).toBeVisible();
    await expect(page.getByTestId('search-control-row').locator('div')).toContainText('Frodo Baggins');
  });

  test('Search for patient via permalink', async ({ page }) => {
    await page.goto('http://localhost:3000/Patient?name=Frodo');
    await expect(page.getByText('Frodo Baggins')).toBeVisible();
    await expect(page.getByTestId('search-control-row').locator('div')).toContainText('Frodo Baggins');
  });

  // test('Upload patient profile photo', async ({ page }) => {
  //   await expect(page.getByTestId('attachment-image')).toBeVisible();
  //   await page.getByRole('tab', { name: 'Details' }).click();
  //   await expect(page.getByTestId('attachment-details')).toBeVisible();
  //   await expect(page.getByTestId('attachment-details')).toContainText('frodo_baggins.png');
  // });
});
