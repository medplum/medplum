# Setup and deployment

The integration is deployed once into a shared Medplum project that holds the ten Bots and six OperationDefinitions. Each customer project links to that shared project, and the customer's own administrator enters their Google OAuth client in their Medplum admin console and runs the installer. This guide covers both roles: the operator of the shared project (sections 1 and 2) and the customer administrator (sections 3 to 6). It does not provision a Google Cloud project or a consuming application. The Workspace Internal target still needs the live checks in [acceptance.md](acceptance.md). A single project can play both roles for development, but that does not prove isolation across linked projects.

## Prerequisites

- A checkout of the public Medplum repository, Node 22.22+ within major 22 or Node 24.2+ within major 24, and npm.
- The Medplum CLI installed (`npm install --global @medplum/cli`). See [CLI authentication](https://www.medplum.com/docs/cli).
- A shared Medplum project with the `bots` feature, where the operator deploys the Bots, and a customer project with `bots` and `cron` enabled and linked to the shared project. Linking and features are set by a Medplum super admin. Installation reports a missing Cron feature; it cannot enable the feature for you.
- A customer administrator who can write policies, memberships and Subscriptions in the customer project and can enter project secrets in the Medplum app.
- A Google OAuth client owned by the customer. The supported target is a Workspace client with an Internal consent screen. Enable Google Calendar API and register the consuming application's callback URI. Use a Desktop client only for the local loopback development helper below.
- The consuming application implements OAuth state validation and PKCE, a connection/settings screen and a disconnect explanation. No application UI ships in this example.

Request `openid`, `email`, `https://www.googleapis.com/auth/calendar.events.owned` and `https://www.googleapis.com/auth/calendar.calendars.readonly`. Request offline access so Google returns a refresh token. The connect operation rejects missing scopes or a missing refresh token.

### Create the Google OAuth client

In the Google Cloud console, in the project that owns the integration:

1. Enable the Google Calendar API under APIs & Services, Library.
2. Configure the consent screen under Google Auth Platform. A Workspace customer chooses the Internal audience. A personal Google account can only choose External; while that app stays in Testing, add every Google account that will connect as a test user, and expect Google to expire its refresh tokens after seven days, so a sandbox connection needs reconnecting weekly.
3. Add the four scopes above under Data Access. The two Calendar scopes are sensitive, so an External app needs Google verification before it leaves Testing.
4. Create an OAuth client under Clients. The consuming application uses a Web application client with its callback URI registered. The local helper below uses a Desktop app client, which Google allows to redirect to a loopback address without registering one.
5. Put the client ID and secret in `.env` as `GOOGLE_CALENDAR_CLIENT_ID` and `GOOGLE_CALENDAR_CLIENT_SECRET`.

## 1. Build and configure locally

Run the following from the repository root:

```sh
npm ci
npx turbo run test --filter=medplum-google-calendar-sync
cp examples/medplum-google-calendar-sync/.env.example examples/medplum-google-calendar-sync/.env
chmod 600 examples/medplum-google-calendar-sync/.env
```

Edit `.env` with your own values. The deploy, install, connect and live-test scripts read this file themselves; a variable already set in the shell takes precedence, so values can also be exported instead of written to the file.

| Variable                                                     | Used by                                | Meaning                                                                                                         |
| ------------------------------------------------------------ | -------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `PROJECT_ID`                                                 | Deploy, install, connect, smoke tests  | Explicit target project; must match the authenticated session                                                   |
| `MEDPLUM_PROFILE`                                            | CLI-backed commands                    | Named CLI login; defaults to `default`                                                                          |
| `MEDPLUM_BASE_URL`                                           | Deploy, install, connect, smoke tests  | API server; defaults to hosted Medplum                                                                          |
| `BASE_URL`                                                   | All deployment/service scripts         | Overrides `MEDPLUM_BASE_URL`; also used by the migration script                                                 |
| `CLIENT_ID`, `CLIENT_SECRET`                                 | Deploy without `--cli`, migration      | Medplum service-client credentials                                                                              |
| `GOOGLE_CALENDAR_CLIENT_ID`, `GOOGLE_CALENDAR_CLIENT_SECRET` | Install (optional), connect, migration | Google OAuth client; the installer reads it from project secrets when these are unset                           |
| `GOOGLE_CALENDAR_ALLOW_EVENT_DETAILS`                        | Install                                | `true` lets each practitioner choose `busy-only`, `initials` or `full`; `false` or unset keeps every event Busy |
| `GOOGLE_CALENDAR_APPOINTMENT_URL`                            | Install                                | Optional authenticated app deep link containing `{id}`                                                          |
| `E2E_MANIFEST`                                               | Live tests and cleanup                 | Absolute path to a new ignored test manifest; reuse that path only for cleanup                                  |
| `CONNECTION_ID`                                              | Mirror migration                       | Existing connection Basic ID; migration checks the authenticated project                                        |

The local connection helper uses `GOOGLE_CALENDAR_CLIENT_ID` (or legacy `GOOGLE_CLIENT_ID`) and the selected CLI profile. It can instead use `MEDPLUM_ACCESS_TOKEN`, but still checks `PROJECT_ID`.

## 2. Deploy the shared Bots (operator)

Use a dedicated CLI profile, then select the shared project:

```sh
medplum --profile "$MEDPLUM_PROFILE" login
medplum --profile "$MEDPLUM_PROFILE" project switch "$PROJECT_ID"
npm run deploy --workspace=medplum-google-calendar-sync -- --cli --check
npm run deploy --workspace=medplum-google-calendar-sync -- --cli
```

For self-hosting, also pass `--base-url "$MEDPLUM_BASE_URL"` to login. With service credentials, omit `--cli`. Deployment authenticates to `BASE_URL` or `MEDPLUM_BASE_URL` and rejects a project mismatch before writing. Run one deployment at a time: administrative Bot creation does not support conditional create. Redeploy after upgrading the example.

Restrict what the shared project exports to linked projects. The resource types are `Bot` and `OperationDefinition`, spelled exactly like that; nothing else in the shared project should be visible to customers:

```json
{ "resourceType": "Project", "exportedResourceType": ["Bot", "OperationDefinition"] }
```

For a single-project sandbox, use the same project for deployment and installation and skip section 3.

## 3. Link the customer project (super admin)

A Medplum super admin adds the shared project to the customer project's `link` list and enables the `bots` and `cron` features on the customer project. See [project linking](https://www.medplum.com/docs/access/projects#project-linking). After linking, the customer administrator sees the shared Bots and OperationDefinitions read-only in their project. Multiple visible Bots with the same integration identifier cause installation to fail, so link one shared Google Calendar project only.

## 4. Enter the Google client and install (customer administrator)

In the Medplum app, open the customer project's admin page, choose the Secrets tab, and add two secrets with these exact names: `GOOGLE_CALENDAR_CLIENT_ID` and `GOOGLE_CALENDAR_CLIENT_SECRET`. Optionally add `GOOGLE_CALENDAR_ALLOW_EVENT_DETAILS` and `GOOGLE_CALENDAR_APPOINTMENT_URL`. Leave event details off unless your organization has approved sending patient details to Google: initials or names next to an appointment time count as protected health information, so turn this on only for Google Workspace accounts covered by a business associate agreement. The client secret never leaves the project.

Then, as that administrator, invoke `Project/$google-calendar-install` with an empty `Parameters` body. From a terminal with the Medplum CLI logged in to the customer project:

```sh
medplum post 'Project/$google-calendar-install' '{"resourceType":"Parameters"}'
```

From a checkout of this repository, `npm run setup:project --workspace=medplum-google-calendar-sync` does the same and prints the result. Parameters with the same names override the stored secrets, which is how a client secret is rotated; `setup:project` forwards any that are set in `.env`.

The installer reads the Google client from the project secrets, installs profiles, creates restricted Bot memberships, configures the webhook URL, and creates Medplum Subscriptions and Crons. If Bot input storage is enabled and the client was passed as a parameter, the install request can be retained there. Restrict that storage and use a dedicated OAuth client.

Read the returned `outcome`, including warnings, even when `installed=true`. Apply the practitioner and ordinary Slot policy entries within the application's existing scopes. Replace broader grants: appending restrictive entries does not remove permissions granted elsewhere. Give practitioners access to the public operation Bots and OperationDefinitions. The installer reports broad access conservatively and does not rewrite practitioner policies. See [policy examples](state-and-status.md#permission-requirements).

Event details are off on first install, so every event syncs as Busy. Changing a secret has no effect until installation runs again: re-run it after you rotate the Google client secret or turn event details on or off, and to repair configuration. New projects need no migration or earlier integration. [Historical migration notes](migration-notes.md) apply only to prototype sandboxes.

## 5. Connect a practitioner

In the consuming app, authenticate the practitioner to Medplum and read `Practitioner/$google-calendar-status`. Its `clientId` output is the installed Google client ID, so the app does not need its own copy. Complete Google's consent flow with that client ID, then send the authorization result to `Practitioner/$google-calendar-connect`:

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

## 6. Verify and recover

Use the [live smoke-test commands](README.md#live-deployment-smoke-tests) after installation and connection. They create temporary Google events and Medplum busy time, so use a test project and account. `deploy -- --cli --e2e` runs the smoke test after deployment; it does not run customer installation or Google consent for you.

Add `-- --extended` to `test:e2e`, or `--extended` alongside `deploy -- --cli --e2e`, to include filtering, a new Schedule, conflicts and recurrence. Choose a new manifest for each run. The extended run uses synthetic resources and does not change privacy settings, revoke access, or disconnect the account.

If a test fails or is interrupted, keep its manifest and run `test:e2e:cleanup` with the same path. Cleanup automatically retries temporary lease contention for up to 28 seconds; resolve remaining authentication or lease errors and retry. A cleanup failure is a failed test, not a successful deployment check. Cancelled synthetic Appointments remain for audit.

## Troubleshooting

| Symptom                                                        | Next check                                                                                                                                                          |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Authenticated project differs from PROJECT_ID`                | Select the intended CLI project and correct `PROJECT_ID`; do not remove the guard                                                                                   |
| CLI authentication fails                                       | Renew the selected profile with `medplum --profile NAME login`, then reselect the project                                                                           |
| Missing Bot or operation                                       | Deploy all ten Bots and six operations; in linked mode inspect exported types and duplicate identifiers                                                             |
| `GOOGLE_CALENDAR_CLIENT_ID is not a project secret`            | Add both Google client secrets in the Medplum app (Admin, Project, Secrets) with the exact names, or pass them as parameters                                        |
| Shared Bots are not visible in the customer project            | Check the link on the customer project and that the shared project exports `Bot` and `OperationDefinition` (not `bots`)                                             |
| Installation cannot finish                                     | Check admin rights, required features and the returned outcome; installation can be retried                                                                         |
| Google connection requires reauthorization                     | Repeat consent with all required scopes and offline access; confirm the client matches the installed client                                                         |
| Crons are active but never run after moving to the shared Bots | The scheduler drops a Cron whose old target vanished and ignores a retarget with the same schedule; re-run the installer, or set the Cron inactive and active again |
| No inbound updates                                             | Check connection status, Google watch registration/callback delivery, importer logs and the minute/hourly Crons                                                     |
| Private-data or imported-Slot access is broader than expected  | Review all matching AccessPolicy grants and legacy history access; profiles are not authorization                                                                   |
| Cleanup remains pending                                        | Restore API access, wait for the worker lease to release, then retry the saved manifest; do not delete unrelated events by title                                    |
