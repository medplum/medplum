# @medplum/e2e

End-to-end tests that run against a real Medplum server and app.

- `api/`: tests that call the server directly with `MedplumClient`
- `ui/`: tests that drive the app in Chromium
- `fixtures/`: shared fixtures and helpers
- `docs-screenshots/`: generates the screenshots in the docs (not part of the e2e suite)

## Prerequisites

1. Postgres, Redis and [Mailpit](https://mailpit.axllent.org/) running on their default ports. From the repository root, `docker compose up` starts all three.
2. Medplum built with reCAPTCHA disabled, from the repository root:

   ```bash
   RECAPTCHA_SITE_KEY= npm run build:fast
   ```

   The e2e server config disables reCAPTCHA, so the app must not render it either.

3. Chromium for Playwright, from this directory:

   ```bash
   npm run playwright:install
   ```

## Running the tests

From this directory:

```bash
npm run test:e2e
```

Playwright starts the server (with `medplum.e2e.config.json` layered over `packages/server/medplum.config.json`) and the app, runs the tests, then stops both. Server logs are written to `logs/server.log`.

To run part of the suite, pass Playwright arguments through, for example:

```bash
npm run test:e2e -- --project=api
npm run test:e2e -- --grep @auth
npm run test:e2e -- ui/signin.test.ts
```

Tags (`@smoke`, `@auth`, `@outbound`) only exist for picking an area locally; CI runs everything.

### Reusing a running server

Outside CI, Playwright reuses a server on port 8103 and an app on port 3000 instead of starting its own. A reused server must load the e2e config and trust the test CA, or tests that depend on them will fail:

```bash
# packages/server
NODE_EXTRA_CA_CERTS=../e2e/.certs/ca.pem npm run dev -- file:medplum.config.json,file:../e2e/medplum.e2e.config.json
```

`.certs/` is created the first time Playwright loads its config.

## Writing tests

Tests must not depend on each other or on shared data. Import `test` and `expect` from `fixtures/test.ts` and use its fixtures:

- `testProject`: a new project whose owner is signed in as a project admin. Use `signIn(page, email, password)` to sign in through the app.
- `superAdmin`: a super admin client, for setup that a project admin can't do, such as enabling project features.
- `startHttpsServer`: starts a local HTTPS server with a certificate signed by the test CA. The server trusts that CA through `NODE_EXTRA_CA_CERTS`.
- `waitForEmail(address)` in `fixtures/mailpit.ts`: waits for an email that the server sent through Mailpit.

Use a unique address, such as `` `e2e-${randomUUID()}@example.com` ``, for every user a test creates.

You can also generate test steps by clicking through the app with the Playwright codegen tool, while the server and app are running:

```bash
npm run playwright:codegen
```

## Generating docs screenshots

`docs-screenshots` drives the Medplum Provider app through documented workflows and writes WebP images into `packages/docs/static/img`. Re-run it when the UI changes, then review the image diffs and update the matching guide.

Run the server with reCAPTCHA disabled, and the Provider app on port 3001 against it:

```bash
# packages/server
npx tsx src/index.ts "file:medplum.config.json,file:../e2e/docs-screenshots/medplum.docs.config.json"

# examples/medplum-provider
RECAPTCHA_SITE_KEY= MEDPLUM_BASE_URL=http://localhost:8103/ npx vite --port 3001
```

Then run `npm run docs:screenshots`. Set `SCREENSHOT_DIR` to write the images somewhere else.
