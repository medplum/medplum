<h1 align="center">Medplum Provider</h1>
<p align="center">A starter application for building a health record system on Medplum.</p>
<p align="center">
<a href="https://github.com/medplum/medplum-hello-world/blob/main/LICENSE.txt">
    <img src="https://img.shields.io/badge/license-Apache-blue.svg" />
  </a>
</p>

This example app demonstrates the following:

- Using [Medplum React Components](https://storybook.medplum.com/?path=/docs/medplum-introduction--docs) to display a chart that provides visibility on a patient
  - More information on a [charting experience](https://www.medplum.com/docs/charting)
- Using [Medplum GraphQL](https://graphiql.medplum.com/) queries to fetch linked resources

### Workflows

The application will feature the following core workflows:

- Visit documentation
- Task creation and assignment
- Appointment scheduling
- Patient registration/onboarding
- Lab orders
- Ordering medications
- Claim creation and billing
- Patient/Provider Messaging

### Getting Started

If you haven't already done so, follow the instructions in [this tutorial](https://www.medplum.com/docs/tutorials/register) to register a Medplum project to store your data.

[Fork](https://github.com/medplum/medplum-provider/fork) and clone the repo. Alternatively, this app lives in the [Medplum monorepo](https://github.com/medplum/medplum) at `examples/medplum-provider` — if you are working from the monorepo, run `npm ci` and `npm run build` at the repo root first so the workspace packages are built.

Next, install the dependencies.

```bash
npm install
```

Then, run the app

```bash
npm run dev
```

This app should run on `http://localhost:3001/`

By default, the app connects to the hosted Medplum service at `https://api.medplum.com/`.

### Running against a local Medplum server

To run against a Medplum server on your own machine, follow the [Run the stack](https://www.medplum.com/docs/contributing/run-the-stack) guide to start the API server on port 8103, then edit `.env` in this directory:

```
MEDPLUM_BASE_URL=http://localhost:8103/
```

Restart `npm run dev` after changing `.env`.

### Google Calendar

Integrations > Google Calendar lets a practitioner connect their Google Calendar. Once connected:

- Appointments and blocked time on the practitioner's Schedules appear on their primary Google Calendar.
- Busy time on that Google Calendar appears as blocked time on their Schedules, so it can't be booked through `$find` and `$book`.
- Patients are never added to Google events as guests.

The page is a front end for the [Google Calendar sync example](../medplum-google-calendar-sync), which does the work in Bots. The app stores nothing itself: it calls the `Practitioner/$google-calendar-*` operations, and the Google client secret stays in the project.

#### Project setup

A project administrator does this once per project. [The sync example's setup guide](../medplum-google-calendar-sync/setup.md) has the details.

1. **Link the shared Bots project.** The Google Calendar Bots live in one shared project, which an operator deploys once for all customer projects. A Medplum super admin links that project to yours and turns on the `bots` and `cron` features. Without the link, the page says Google Calendar sync is not installed.
2. **Create a Google OAuth client.** In Google Cloud, enable the Google Calendar API and create a Web application client. Add `<app origin>/integrations/google-calendar/callback` as an authorized redirect URI, for example `https://provider.example.com/integrations/google-calendar/callback`. For local development, a Desktop client also accepts `http://localhost:3001/integrations/google-calendar/callback`.
3. **Add the project secrets.** In the Medplum app, open Admin > Project > Secrets:

   | Secret                                | Required | Value                                                                                                                                           |
   | ------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
   | `GOOGLE_CALENDAR_CLIENT_ID`           | Yes      | The OAuth client ID. The page reads it from the status operation, so the app needs no copy.                                                     |
   | `GOOGLE_CALENDAR_CLIENT_SECRET`       | Yes      | The OAuth client secret. Only the Bots read it.                                                                                                 |
   | `GOOGLE_CALENDAR_ALLOW_EVENT_DETAILS` | No       | `true` lets each practitioner choose Busy only, Initials or Full details. `false` or unset shows every appointment as Busy. See the note below. |
   | `GOOGLE_CALENDAR_APPOINTMENT_URL`     | No       | A link added to each Google event, with `{id}` replaced by the Appointment ID, for example `https://provider.example.com/Appointment/{id}`.     |

4. **Run the installer.** As a project administrator:

   ```sh
   medplum post 'Project/$google-calendar-install' '{"resourceType":"Parameters"}'
   ```

   The installer copies the secrets into the integration's settings. Changing a secret later does nothing until you run the installer again.

   The installer also creates the address Google sends calendar changes to and saves it as the secret `GOOGLE_CALENDAR_WEBHOOK_URL`. Don't set or edit it yourself; running the installer again recreates it. Nothing needs configuring in Google Cloud for it.

5. **Grant practitioner access.** The installer's response lists the AccessPolicy entries practitioners need: read access to the operation Bots and OperationDefinitions, and their own status. See [permission requirements](../medplum-google-calendar-sync/state-and-status.md#permission-requirements). To book visits from the Schedule page, practitioners also need to create Appointments and Encounters; without that, Create Visit fails.

Event details are off by default. Patient initials or names next to an appointment time count as protected health information, so turn on `GOOGLE_CALENDAR_ALLOW_EVENT_DETAILS` only if your organization has approved sending patient details to Google, for example for Google Workspace accounts covered by a business associate agreement.

#### Connecting a calendar

1. Open Integrations, find the Google Calendar card and click **Set Up**.
2. Click **Connect Google Calendar**, then approve access in Google.
3. Back in the app, the page shows the connected account, the last sync in each direction, and any appointments that overlap Google busy time.

From the same page a practitioner can change how much detail Google events show (when the project allows it), queue a sync with **Sync now**, or disconnect. Disconnecting removes the blocked time imported from Google, so those times can be booked again.

The first sync takes a few minutes. Events already in the past keep the detail level they were sent with when a practitioner raises it.

#### Troubleshooting

| What you see                            | What to check                                                                                                                            |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| "Google Calendar sync is not installed" | The shared project is linked, the installer has run, and the practitioner's policy can read the operation Bots and OperationDefinitions. |
| "No Google OAuth client installed"      | Both client secrets are set, then the installer was run again.                                                                           |
| Google shows `redirect_uri_mismatch`    | The callback URL for this app's origin is registered on the OAuth client.                                                                |
| "Reconnect required"                    | Google revoked access or the consent was incomplete. Click **Reconnect Google Calendar** and approve all scopes.                         |
| The detail choice is missing            | `GOOGLE_CALENDAR_ALLOW_EVENT_DETAILS` is `true`, and the installer was run after setting it.                                             |

To test against a different OAuth client without changing the project, set `GOOGLE_CALENDAR_CLIENT_ID` in `.env`. It overrides the client ID the page reads from the project.

### A note on value sets

Some fields in this app (diagnoses, medications, race/ethnicity, and others) autocomplete against clinical terminologies such as ICD-10, RxNorm, and US Core / VSAC value sets. On hosted Medplum, these are provided by shared projects [linked](https://www.medplum.com/docs/access/projects#project-linking) into your project. A fresh self-hosted or local server includes only the base FHIR R4 terminology, so these fields will show a "ValueSet not found" message inline and you will need to enter codes manually. To enable them, upload the value sets and import their code systems into a shared project (see [`CodeSystem/$import`](https://www.medplum.com/docs/api/fhir/operations/codesystem-import)) and link that project, or contact Medplum for access to the hosted terminology.

### About Medplum

[Medplum](https://www.medplum.com/) is an open-source, API-first EHR. Medplum makes it easy to build healthcare apps quickly with less code.

Medplum supports self-hosting and provides a [hosted service](https://app.medplum.com/). Medplum Hello World uses the hosted service as a backend.

- Read our [documentation](https://www.medplum.com/docs)
- Browse our [react component library](https://storybook.medplum.com/)
- Join our [Discord](https://discord.gg/medplum)
