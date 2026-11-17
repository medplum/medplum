# Medplum Google Calendar Sync

This example syncs a practitioner's Medplum schedule with their primary Google Calendar. Medplum Appointments and blocks become Google events. Google Busy events become `busy-unavailable` Slots in Medplum.

**NOTE**: This example has no user interface. Your application runs Google's OAuth flow and calls the operations below. The example has passed unit tests and live tests in a single project. See [Limitations](#limitations) for what is untested.

## Features

- **Medplum to Google**: Creates, updates and removes a Google event for each Appointment and block. Writes only to events the integration owns.
- **Google to Medplum**: Creates a Slot on each of the practitioner's active Schedules for each timed Busy event, including each occurrence of a recurring event. Skips all-day, Free, cancelled and declined events. Never creates or changes an Appointment.
- **Privacy**: Sends every event as Busy by default. A project can let each practitioner choose `busy-only`, `initials` or `full`. Never adds a patient as an attendee. Never copies a Google title, description or guest list into Medplum.
- **Recovery**: An hourly Cron repairs missed changes. A Cron that runs every minute retries unfinished work.

## Bots

| Bot identifier                   | Purpose                                             |
| -------------------------------- | --------------------------------------------------- |
| `install-google-calendar`        | Installs the integration in a project               |
| `google-calendar-connect-bot`    | Exchanges the OAuth code and stores the credential  |
| `google-calendar-status-bot`     | Returns connection status                           |
| `google-calendar-settings-bot`   | Changes a practitioner's detail level               |
| `google-calendar-disconnect-bot` | Queues disconnect cleanup                           |
| `google-calendar-sync-range-bot` | Queues a sync of a date range                       |
| `google-calendar-sync-bot`       | Sends Appointment and block changes to Google       |
| `google-calendar-reconcile-bot`  | Runs on the Crons and repairs missed changes        |
| `google-calendar-import-bot`     | Imports Google Busy events; cleans up on disconnect |
| `google-calendar-webhook-bot`    | Receives Google's change notifications              |

The first six implement the [custom FHIR operations](#custom-fhir-operations). The last four run in the background.

## Prerequisites

1. Node.js 22.22+ or 24.2+, and npm
2. The [Medplum CLI](https://www.medplum.com/docs/cli)
3. A Medplum project with the `bots` and `cron` features, and a project admin login
4. A Google Cloud project with the Google Calendar API enabled
5. A Google OAuth client with these scopes: `openid`, `email`, `https://www.googleapis.com/auth/calendar.events.owned` and `https://www.googleapis.com/auth/calendar.calendars.readonly`

## Setup

Run every command from the root of the Medplum repository.

1. Install dependencies and build:

   ```bash
   npm ci
   npx turbo run build --filter=medplum-google-calendar-sync
   ```

2. Create the `.env` file and set `PROJECT_ID` in it:

   ```bash
   cp examples/medplum-google-calendar-sync/.env.example examples/medplum-google-calendar-sync/.env
   ```

3. Log in with the CLI profile named in `.env`, then deploy the Bots and OperationDefinitions. Deploy stops if the login's project is not `PROJECT_ID`.

   ```bash
   medplum --profile gcal-sandbox login
   npm run deploy --workspace=medplum-google-calendar-sync -- --cli
   ```

4. In the [Medplum App](https://app.medplum.com), open the Project admin page and the Secrets tab. Add these secrets:

   | Secret Name                           | Description                                                 | Required |
   | ------------------------------------- | ----------------------------------------------------------- | -------- |
   | `GOOGLE_CALENDAR_CLIENT_ID`           | Google OAuth client ID                                      | Yes      |
   | `GOOGLE_CALENDAR_CLIENT_SECRET`       | Google OAuth client secret                                  | Yes      |
   | `GOOGLE_CALENDAR_ALLOW_EVENT_DETAILS` | `true` lets practitioners choose `initials` or `full`       | No       |
   | `GOOGLE_CALENDAR_APPOINTMENT_URL`     | Link added to each event; `{id}` becomes the Appointment ID | No       |

   Patient initials or a name next to an appointment time are protected health information. Set `GOOGLE_CALENDAR_ALLOW_EVENT_DETAILS` to `true` only for Google Workspace accounts covered by a business associate agreement.

5. Run the installer as a project admin. Run it again each time you change a secret.

   ```bash
   medplum --profile gcal-sandbox post 'Project/$google-calendar-install' '{"resourceType":"Parameters"}'
   ```

6. Add the AccessPolicy entries listed in the response's `outcome` to your practitioner policy. They let a practitioner read their own connection status and call the operations.

7. Connect a practitioner. See [Connecting a Practitioner](#connecting-a-practitioner).

## Connecting a Practitioner

Your application does the following as the logged-in practitioner:

1. Reads `clientId` from `$google-calendar-status`.
2. Sends the practitioner to Google's consent screen with that client ID, the four scopes, PKCE and `access_type=offline`.
3. Posts the authorization code to `$google-calendar-connect`:

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

To connect without an application, install a Desktop app OAuth client, set `GOOGLE_CALENDAR_CLIENT_ID` in `.env`, log in to the CLI as the practitioner, and run:

```bash
npm run connect-local --workspace=medplum-google-calendar-sync
```

## Custom FHIR Operations

Every operation takes a FHIR `Parameters` resource. The practitioner is always the authenticated user.

| Operation                                        | Inputs                                                             | Result                                              |
| ------------------------------------------------ | ------------------------------------------------------------------ | --------------------------------------------------- |
| `POST /Project/$google-calendar-install`         | None                                                               | AccessPolicy entries to add                         |
| `POST /Practitioner/$google-calendar-connect`    | `code`, `codeVerifier`, `redirectUri`; optional `eventDetailLevel` | Connection summary. Queues the first sync.          |
| `POST /Practitioner/$google-calendar-status`     | None                                                               | Connection status and Google client ID              |
| `POST /Practitioner/$google-calendar-settings`   | `eventDetailLevel`                                                 | Connection summary. Queues an update of all events. |
| `POST /Practitioner/$google-calendar-disconnect` | Optional `forgetRevoked`                                           | Queues removal of events, Slots and the credential  |
| `POST /Practitioner/$google-calendar-sync`       | Optional `start` and `end`                                         | The queued range                                    |

`$google-calendar-status` returns these parameters, among others:

| Parameter                           | Meaning                                                  |
| ----------------------------------- | -------------------------------------------------------- |
| `connected`                         | The practitioner has a connection                        |
| `status`                            | `active`, `reauth-required` or `disconnecting`           |
| `stale`, `staleReason`              | The last import failed, is overdue or has not run        |
| `inboundPending`, `outboundPending` | Queued work is unfinished                                |
| `privacyCleanupPending`             | A lowered detail level is not yet applied to every event |

When `status` is `reauth-required`, the practitioner must connect again. `src/common/contracts.ts` defines every input and output.

## Testing

Run the unit tests. They mock Google.

```bash
npm test --workspace=medplum-google-calendar-sync
```

Run the live tests against a test project and a test Google account. They need a CLI login for a connected practitioner who is a project admin and has an active Schedule. They create one Appointment and one Google event, check create, update and removal in both directions, then remove what they created.

```bash
export E2E_MANIFEST="$PWD/test-results/gcal-e2e-$(date +%s).json"
npm run test:e2e --workspace=medplum-google-calendar-sync
```

Add `-- --extended` to also test event filtering, a new Schedule and recurring events. If a run is interrupted, run `test:e2e:cleanup` with the same `E2E_MANIFEST`.

## Limitations

- Untested: linked projects, Google Workspace Internal consent, calendars with thousands of events, Google quota limits, recurrence exceptions.
- The refresh token is stored unencrypted in a `Basic` resource. AccessPolicy is the only protection: a project admin, or a user whose policy grants `Basic`, can read it.
- Without a range, sync covers 90 days from now. `$google-calendar-sync` accepts a range of up to 366 days.
- Any user who can write Slots can change an imported Slot. To prevent that, replace the user's Slot write grant with `ORDINARY_SLOT_POLICY_SNIPPET` from `src/common/policies.ts`.
- The integration sends no notifications. `notificationSubscription()` in `src/common/subscriptions.ts` returns a Subscription that fires on `reauth-required`.
- Disconnect deletes the imported Slots, so those times become bookable.
- Google expires the refresh tokens of an OAuth app in Testing status after seven days.

## Learn More

- [Bot Code Organization](https://www.medplum.com/docs/bots/bot-code-organization)
- [Custom FHIR Operations](https://www.medplum.com/docs/bots/custom-fhir-operations)
- [Bot Secrets](https://www.medplum.com/docs/bots/bot-secrets)
- [Access Policies](https://www.medplum.com/docs/access/access-policies)
