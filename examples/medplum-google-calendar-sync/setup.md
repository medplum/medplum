# Setup and deployment

This guide packages the integration for installation into your own Medplum project. It does not provision a Google Cloud project or a consuming application. The Workspace Internal/shared-project deployment target still needs the live checks in [acceptance.md](acceptance.md). A single-project sandbox is useful for development, but does not prove isolation across linked projects.

## Prerequisites

- A checkout of the public Medplum repository, Node 22.22+ within major 22 or Node 24.2+ within major 24, and npm.
- The Medplum CLI installed (`npm install --global @medplum/cli`). See [CLI authentication](https://www.medplum.com/docs/cli).
- A Medplum project with `bots` and `cron` enabled. An administrator must be able to deploy Bots, write definitions, policies, memberships and Subscriptions, and configure project secrets. Installation reports a missing Cron feature; it cannot enable the feature for you.
- A Google OAuth client. The supported target is a customer-owned Workspace client with an Internal consent screen. Enable Google Calendar API and register the consuming application's callback URI. Use a Desktop client only for the local loopback development helper below.
- The consuming application implements OAuth state validation and PKCE, a connection/settings screen and a disconnect explanation. No application UI ships in this example.

Request `openid`, `email`, `https://www.googleapis.com/auth/calendar.events.owned` and `https://www.googleapis.com/auth/calendar.calendars.readonly`. Request offline access so Google returns a refresh token. The connect operation rejects missing scopes or a missing refresh token.

## 1. Build and configure locally

Run the following from the repository root:

```sh
npm ci
npx turbo run test --filter=medplum-google-calendar-sync
cp examples/medplum-google-calendar-sync/.env.example examples/medplum-google-calendar-sync/.env
chmod 600 examples/medplum-google-calendar-sync/.env
```

Edit `.env` with your own values, then load it explicitly. The scripts do not load dotenv automatically:

```sh
set -a
. examples/medplum-google-calendar-sync/.env
set +a
```

| Variable                                                     | Used by                               | Meaning                                                                                                |
| ------------------------------------------------------------ | ------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `PROJECT_ID`                                                 | Deploy, install, connect, smoke tests | Explicit target project; must match the authenticated session                                          |
| `MEDPLUM_PROFILE`                                            | CLI-backed commands                   | Named CLI login; defaults to `default`                                                                 |
| `MEDPLUM_BASE_URL`                                           | Deploy, install, connect, smoke tests | API server; defaults to hosted Medplum                                                                 |
| `BASE_URL`                                                   | All deployment/service scripts        | Overrides `MEDPLUM_BASE_URL`; also used by the migration script                                        |
| `CLIENT_ID`, `CLIENT_SECRET`                                 | Deploy without `--cli`, migration     | Medplum service-client credentials                                                                     |
| `GOOGLE_CALENDAR_CLIENT_ID`, `GOOGLE_CALENDAR_CLIENT_SECRET` | Install, migration                    | Google OAuth client credentials; these are different from Medplum credentials                          |
| `GOOGLE_CALENDAR_DETAIL_LEVEL`                               | Install                               | Project ceiling: `busy-only`, `initials`, or `full`; omit on reinstall to preserve an existing ceiling |
| `GOOGLE_CALENDAR_APPOINTMENT_URL`                            | Install                               | Optional authenticated app deep link containing `{id}`                                                 |
| `E2E_MANIFEST`                                               | Live tests and cleanup                | Absolute path to a new ignored test manifest; reuse that path only for cleanup                         |
| `CONNECTION_ID`                                              | Mirror migration                      | Existing connection Basic ID; migration checks the authenticated project                               |

The local connection helper uses `GOOGLE_CALENDAR_CLIENT_ID` (or legacy `GOOGLE_CLIENT_ID`) and the selected CLI profile. It can instead use `MEDPLUM_ACCESS_TOKEN`, but still checks `PROJECT_ID`.

## 2. Authenticate and deploy

Use a dedicated CLI profile, then select the deployment project:

```sh
medplum --profile "$MEDPLUM_PROFILE" login
medplum --profile "$MEDPLUM_PROFILE" project switch "$PROJECT_ID"
npm run deploy --workspace=medplum-google-calendar-sync -- --cli --check
npm run deploy --workspace=medplum-google-calendar-sync -- --cli
```

For self-hosting, also pass `--base-url "$MEDPLUM_BASE_URL"` to login. With service credentials, omit `--cli`. Deployment authenticates to `BASE_URL` or `MEDPLUM_BASE_URL` and rejects a project mismatch before writing. Run one deployment at a time: administrative Bot creation does not support conditional create.

For a single-project sandbox, use the same project for deployment and installation. For a shared-Bot deployment, deploy into the shared project first. Link the customer project to it and export the Bots and OperationDefinitions needed for invocation. Do not export customer Basic resources or Slots. Then select the customer CLI project and change `PROJECT_ID` before installation. Multiple visible Bots with the same integration identifier cause installation to fail.

## 3. Install into the customer project

As a project administrator, with the Google client variables loaded:

```sh
npm run setup:project --workspace=medplum-google-calendar-sync
```

This invokes `Project/$google-calendar-install` using FHIR Parameters. It installs profiles, creates restricted Bot memberships, configures the webhook URL, and creates Medplum Subscriptions and Crons. The Google client secret is sent to Medplum and stored as a project secret; it is not printed by this script. If Bot input storage is enabled, the install request can also be retained there. Restrict that storage and use a dedicated OAuth client.

Read the returned `outcome`, including warnings, even when `installed=true`. Apply the practitioner and ordinary Slot policy entries within the application's existing scopes. Replace broader grants: appending restrictive entries does not remove permissions granted elsewhere. Give practitioners access to the public operation Bots and OperationDefinitions. The installer reports broad access conservatively and does not rewrite practitioner policies. See [policy examples](state-and-status.md#permission-requirements).

The project defaults to `busy-only` on first install. Re-run installation to rotate the Google client secret, change the ceiling, or repair configuration. New projects need no migration or earlier integration. [Historical migration notes](migration-notes.md) apply only to prototype sandboxes.

## 4. Connect a practitioner

In the consuming app, authenticate the practitioner to Medplum, complete Google's consent flow, and send the authorization result to `Practitioner/$google-calendar-connect`:

```json
{
  "resourceType": "Parameters",
  "parameter": [
    { "name": "code", "valueString": "AUTHORIZATION_CODE_FROM_GOOGLE" },
    { "name": "codeVerifier", "valueString": "ORIGINAL_PKCE_VERIFIER" },
    { "name": "redirectUri", "valueString": "https://example.com/oauth/google/callback" },
    { "name": "eventDetailLevel", "valueString": "busy-only" }
  ]
}
```

The practitioner comes from the authenticated requester, not a body parameter. The callback URI must match the authorization request and Google registration. Do not put the Google client secret in browser code. The connect operation stores the credential and queues initial work. The importer registers and renews Google's watch channel using the webhook URL configured by installation; users do not enter a webhook URL.

For local development only, install a Desktop OAuth client's credentials, log in as the intended practitioner, then run:

```sh
npm run connect-local --workspace=medplum-google-calendar-sync -- busy-only
```

Open the printed Google consent URL on the same computer. The helper listens on `127.0.0.1:8765`, validates state and uses PKCE. Keep it running until Google redirects back. It sends the code to the deployed connect operation; it does not implement a production callback or user interface. Personal-account success is not Workspace acceptance.

Disconnect and range-sync requests queue even while a worker is running. A running worker may finish before disconnect cleanup starts; cleanup uses the same worker lease. Reconnect writes credentials under that lease and can return "A calendar sync is running; try reconnecting again in a few minutes". Retry reconnect after the worker finishes.

Read `Practitioner/$google-calendar-status` with empty Parameters to observe progress. `reauth-required` means the practitioner must reconnect. Lowering detail queues an asynchronous historical scrub; wait until `privacyCleanupPending` clears. Explicit disconnect removes imported blocks and can make those times bookable, subject to other availability rules.

## 5. Verify and recover

Use the [live smoke-test commands](README.md#live-deployment-smoke-tests) after installation and connection. They create temporary Google events and Medplum busy time, so use a test project and account. `deploy -- --cli --e2e` runs the smoke test after deployment; it does not run customer installation or Google consent for you.

Add `-- --extended` to `test:e2e`, or `--extended` alongside `deploy -- --cli --e2e`, to include filtering, a new Schedule, conflicts and recurrence. Choose a new manifest for each run. The extended run uses synthetic resources and does not change privacy settings, revoke access, or disconnect the account.

If a test fails or is interrupted, keep its manifest and run `test:e2e:cleanup` with the same path. Cleanup automatically retries temporary lease contention for up to 28 seconds; resolve remaining authentication or lease errors and retry. A cleanup failure is a failed test, not a successful deployment check. Cancelled synthetic Appointments remain for audit.

## Troubleshooting

| Symptom                                                       | Next check                                                                                                                       |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `Authenticated project differs from PROJECT_ID`               | Select the intended CLI project and correct `PROJECT_ID`; do not remove the guard                                                |
| CLI authentication fails                                      | Renew the selected profile with `medplum --profile NAME login`, then reselect the project                                        |
| Missing Bot or operation                                      | Deploy all ten Bots and six operations; in linked mode inspect exported types and duplicate identifiers                          |
| Installation cannot finish                                    | Check admin rights, required features and the returned outcome; installation can be retried                                      |
| Google connection requires reauthorization                    | Repeat consent with all required scopes and offline access; confirm the client matches the installed client                      |
| No inbound updates                                            | Check connection status, Google watch registration/callback delivery, importer logs and the minute/hourly Crons                  |
| Private-data or imported-Slot access is broader than expected | Review all matching AccessPolicy grants and legacy history access; profiles are not authorization                                |
| Cleanup remains pending                                       | Restore API access, wait for the worker lease to release, then retry the saved manifest; do not delete unrelated events by title |
