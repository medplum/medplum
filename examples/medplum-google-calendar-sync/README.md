# Medplum Google Calendar Sync

This example syncs a practitioner's Medplum schedule with their primary Google Calendar. Medplum Appointments and blocks become Google events. Google Busy events become `busy-unavailable` Slots in Medplum.

**NOTE**: This example has no user interface. Your application runs Google's OAuth flow and calls the operations below. The unit tests mock Google, so run the [manual check](#testing) against a test calendar before relying on it. See [Limitations](#limitations).

## Features

- **Medplum to Google**: Creates, updates and removes a Google event for each eligible Appointment and block. An Appointment is eligible while it is booked, arrived, checked in, fulfilled or a no-show; a block is a `busy-unavailable` Slot with no service type. Writes only to events the integration owns.
- **Google to Medplum**: Creates a Slot on each of the practitioner's active Schedules for each timed Busy event, including each occurrence of a recurring event. Skips all-day, Free, cancelled and declined events. Never creates or changes an Appointment.
- **Privacy**: Sends every event as Busy by default. A project can let each practitioner choose `busy-only`, `initials` or `full`. Never adds a patient as an attendee. Never copies a Google title, description or guest list into Medplum.
- **Recovery**: An hourly Cron repairs missed changes in both directions, including a Schedule that changed hands. A Cron that runs every minute retries unfinished work.

## Bots

| Bot identifier                   | Purpose                                             |
| -------------------------------- | --------------------------------------------------- |
| `install-google-calendar`        | Installs the integration in a project               |
| `google-calendar-connect-bot`    | Exchanges the OAuth code and stores the credential  |
| `google-calendar-status-bot`     | Returns connection status                           |
| `google-calendar-settings-bot`   | Changes a practitioner's detail level               |
| `google-calendar-disconnect-bot` | Queues disconnect cleanup                           |
| `google-calendar-sync-bot`       | Sends Appointment and block changes to Google       |
| `google-calendar-reconcile-bot`  | Runs on the Crons and repairs missed changes        |
| `google-calendar-import-bot`     | Imports Google Busy events; cleans up on disconnect |
| `google-calendar-webhook-bot`    | Receives Google's change notifications              |

The first five implement the [custom FHIR operations](#custom-fhir-operations). The last four run in the background.

## Prerequisites

1. Node.js 22.22+ or 24.2+, and npm
2. The [Medplum CLI](https://www.medplum.com/docs/cli)
3. Two Medplum projects: a Bots project that holds the Bots, and the customer project that uses them. Both need the `bots` feature, and the customer project also needs `cron`. To try the example in one project, use the same project for both and skip Setup step 4.
4. A Google Cloud project used only for this integration and this Medplum project, with the Google Calendar API enabled. Disconnecting revokes the Google account's access to everything in that Google Cloud project.
5. A Google OAuth client with these scopes: `openid`, `email`, `https://www.googleapis.com/auth/calendar.events.owned` and `https://www.googleapis.com/auth/calendar.calendars.readonly`. Register your application's exact callback URL on it.

## Setup

Run every command from the root of the Medplum repository. The steps use two CLI profiles: `gcal-bots` is a project admin of the Bots project, and `gcal-customer` is a project admin of the customer project.

1. Install dependencies and build:

   ```bash
   npm ci
   npx turbo run build --filter=medplum-google-calendar-sync
   ```

2. Create the `.env` file and set `PROJECT_ID` in it to the Bots project:

   ```bash
   cp examples/medplum-google-calendar-sync/.env.example examples/medplum-google-calendar-sync/.env
   ```

3. Deploy the Bots and OperationDefinitions to the Bots project. Deploy stops if the login's project is not `PROJECT_ID`.

   ```bash
   medplum --profile gcal-bots login
   npm run deploy --workspace=medplum-google-calendar-sync -- --cli
   ```

4. Ask a super admin to [link the projects](https://www.medplum.com/docs/access/projects#setting-up-a-shared-project): set `exportedResourceType` to `["Bot", "OperationDefinition"]` on the Bots project, and add the Bots project to the customer project's `link`. On hosted Medplum, ask Medplum support.

5. In the [Medplum App](https://app.medplum.com), open the customer project's admin page and the Secrets tab. Add these secrets:

   | Secret Name                           | Description                                                 | Required |
   | ------------------------------------- | ----------------------------------------------------------- | -------- |
   | `GOOGLE_CALENDAR_CLIENT_ID`           | Google OAuth client ID                                      | Yes      |
   | `GOOGLE_CALENDAR_CLIENT_SECRET`       | Google OAuth client secret                                  | Yes      |
   | `GOOGLE_CALENDAR_ALLOW_EVENT_DETAILS` | `true` lets practitioners choose `initials` or `full`       | No       |
   | `GOOGLE_CALENDAR_APPOINTMENT_URL`     | Link added to each event; `{id}` becomes the Appointment ID | No       |

   Patient initials or a name next to an appointment time are protected health information. Set `GOOGLE_CALENDAR_ALLOW_EVENT_DETAILS` to `true` only for Google Workspace accounts covered by a business associate agreement. Every practitioner stays on `busy-only` until they choose another level.

6. Run the installer in the customer project as a project admin. Run it again each time you change a secret.

   ```bash
   medplum --profile gcal-customer login
   medplum --profile gcal-customer post 'Project/$google-calendar-install' '{"resourceType":"Parameters"}'
   ```

7. Add the AccessPolicy entries listed in the response's `outcome` to your practitioner policy. They let a practitioner read their own connection status and call the operations.

8. Connect a practitioner. See [Connecting a Practitioner](#connecting-a-practitioner).

## Connecting a Practitioner

Each practitioner connects their own Google account. Two practitioners cannot share one.

Your application does the following as the logged-in practitioner:

1. Reads `clientId` from `$google-calendar-status`.
2. Sends the practitioner to Google's consent screen with that client ID, the four scopes, PKCE, a random `state`, `access_type=offline` and `prompt=consent`. Google returns a refresh token only when consent is shown.
3. On the callback, checks that `state` matches, then posts the authorization code to `$google-calendar-connect`. `redirectUri` must be the callback URL registered on the OAuth client:

   ```json
   {
     "resourceType": "Parameters",
     "parameter": [
       { "name": "code", "valueString": "AUTHORIZATION_CODE_FROM_GOOGLE" },
       { "name": "codeVerifier", "valueString": "ORIGINAL_PKCE_VERIFIER" },
       { "name": "redirectUri", "valueString": "https://example.com/oauth/google/callback" }
     ]
   }
   ```

To connect without an application, use a Desktop app OAuth client as the project's `GOOGLE_CALENDAR_CLIENT_ID` and `GOOGLE_CALENDAR_CLIENT_SECRET`. Log in as the practitioner and choose the customer project, set `PROJECT_ID` in `.env` to the customer project and `MEDPLUM_PROFILE` to `gcal-practitioner`, then run:

```bash
medplum --profile gcal-practitioner login
npm run connect-local --workspace=medplum-google-calendar-sync
```

## Custom FHIR Operations

Every operation takes a FHIR `Parameters` resource. The practitioner is always the authenticated user.

| Operation                                        | Inputs                                                             | Result                                                                                                                                                                                                                 |
| ------------------------------------------------ | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /Project/$google-calendar-install`         | None                                                               | AccessPolicy entries to add                                                                                                                                                                                            |
| `POST /Practitioner/$google-calendar-connect`    | `code`, `codeVerifier`, `redirectUri`; optional `eventDetailLevel` | Connection summary. Queues the first sync.                                                                                                                                                                             |
| `POST /Practitioner/$google-calendar-status`     | None                                                               | Connection status and Google client ID                                                                                                                                                                                 |
| `POST /Practitioner/$google-calendar-settings`   | `eventDetailLevel`                                                 | Connection summary. Queues an update of all events. Fails while a sync is running; retry after a few minutes.                                                                                                          |
| `POST /Practitioner/$google-calendar-disconnect` | Optional `forgetRevoked`                                           | Queues removal of events, Slots and the credential, and revokes the account's grant to this OAuth client. If Google access was revoked, cleanup waits until `forgetRevoked` is `true`, and the Google events may stay. |

`$google-calendar-status` returns these parameters, among others:

| Parameter                           | Meaning                                                                                                                                          |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `connected`                         | The practitioner has a connection                                                                                                                |
| `status`                            | `active`, `reauth-required` or `disconnecting`                                                                                                   |
| `stale`, `staleReason`              | The last import failed, is overdue or has not run; `watch-unavailable` means Google notifications could not be registered and imports run hourly |
| `inboundPending`, `outboundPending` | Queued work is unfinished                                                                                                                        |
| `privacyCleanupPending`             | A lowered detail level is not yet applied to every event                                                                                         |

When `status` is `reauth-required`, the practitioner must connect again. `src/common/contracts.ts` defines every input and output.

## Testing

Run the unit tests. They mock Google.

```bash
npm test --workspace=medplum-google-calendar-sync
```

Then check a real calendar by hand, in a test project with a test Google account:

1. Connect a practitioner who has an active Schedule, and wait for `$google-calendar-status` to report `lastSuccessfulInbound`.
2. Book an Appointment for the practitioner. An event titled "Appointment" appears in Google. Move it to another time; the event moves. Cancel it; the event disappears.
3. Create a timed Busy event in Google. A `busy-unavailable` Slot appears on the Schedule. Delete the event; the Slot disappears.
4. With event details allowed, book a future Appointment with a test patient and set the level to `full` with `$google-calendar-settings`. Wait for the patient's name to appear in the event title. Set the level back to `busy-only` and wait for `privacyCleanupPending` to be false; the title is "Appointment" again.
5. Create another Busy event in Google and wait for its Slot. Call `$google-calendar-disconnect`, then poll `$google-calendar-status` until `connected` is false. The Appointment's event and the imported Slot are gone.
6. In the customer project, check that the hourly Cron has run. The install response gives its minute; look for a successful AuditEvent at that minute whose entity is the Cron with identifier `reconcile-cron`. The Cron with identifier `work-cron` runs the same Bot every minute.

## Limitations

- Untested: linked projects, Google Workspace Internal consent, calendars with thousands of events, Google quota limits, recurrence exceptions.
- The refresh token is stored unencrypted in a `Basic` resource. AccessPolicy is the only protection: a project admin, or a user whose policy grants `Basic`, can read it.
- Discovery and import cover 90 days from now. A change to an Appointment or block outside that window is still sent to Google when it happens, and existing mirrored events are checked whatever their date.
- Any user who can write Slots can change an imported Slot.
- The integration sends no notifications. Subscribe to the status record if you need to know when a practitioner must reconnect.
- Disconnect deletes the imported Slots, so those times become bookable.
- Google expires the refresh tokens of an OAuth app in Testing status after seven days.

## Learn More

- [Bot Code Organization](https://www.medplum.com/docs/bots/bot-code-organization)
- [Custom FHIR Operations](https://www.medplum.com/docs/bots/custom-fhir-operations)
- [Bot Secrets](https://www.medplum.com/docs/bots/bot-secrets)
- [Access Policies](https://www.medplum.com/docs/access/access-policies)
