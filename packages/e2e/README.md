# @medplum/e2e

A collection of end-to-end tests to run against Medplum

## Getting started

Before running any tests, you have to install Playwright in your local environment. To do this, run the following command in this directory:

```bash
npm run playwright:install
```

This installs Playwright along with the required Chromium dependency.

## Running the smoke tests

To run the tests, after making sure that both `@medplum/server` and `@medplum/app` are running, run the following command:

```bash
npm run test:smoke
```

## Writing tests

Aside from writing tests manually, you can also use the Playwright codegen tool to create tests by clicking through scenarios in the actual app.

To use the tool, start both `@medplum/server` and `@medplum/app` locally on the default ports and then run the following command:

```bash
npm run playwright:codegen
```

## Generating docs screenshots

The `docs-screenshots` suite drives the Medplum Provider app through documented workflows and writes WebP screenshots directly into `packages/docs/static/img`. Re-run it whenever the UI changes, then review the image diffs and update the matching guide.

Start the server with the docs config overlay, which disables reCAPTCHA so the suite can register new accounts:

```bash
cd packages/server
npx tsx src/index.ts "file:medplum.config.json,file:../e2e/docs-screenshots/medplum.docs.config.json"
```

Start the Provider app on port 3001 against the local server:

```bash
cd examples/medplum-provider
RECAPTCHA_SITE_KEY= MEDPLUM_BASE_URL=http://localhost:8103/ MEDPLUM_PROJECT_ID= npx vite --port 3001
```

Then generate the screenshots:

```bash
npm run docs:screenshots
```

Set `SCREENSHOT_DIR` to write images somewhere else, for example to preview changes without touching the docs.
