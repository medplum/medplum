<h1 align="center">Medplum Practitioner Lookup Demo</h1>
<p align="center">A signed-in practitioner looks up another practitioner in the NPPES NPI Registry and refers one of their patients to them.</p>

## Overview

- **Search** by NPI, name, specialty, or location. The app calls the [`nppes-lookup` bot](../medplum-demo-bots/src/nppes-lookup.ts), which queries NPPES and returns a FHIR `searchset` Bundle. Searches are always for individual providers (`enumeration_type=NPI-1`).
- **Results** are shown as cards with name, specialty, address, and phone, read from the FHIR `Practitioner` and `PractitionerRole` in the Bundle.
- **Refer**: click **Select** on a card, pick one of your patients, and submit. The app saves the doctor and creates a referral (`ServiceRequest`).

### Why a bot?

The NPPES Registry API does not send CORS headers, so a browser app cannot call it directly. The bot calls NPPES server-side, converts the results to FHIR, and the app calls the bot through Medplum's authenticated `$execute` operation.

### Code

| File                                                                         | What it does                                                                       |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| [src/pages/HomePage.tsx](./src/pages/HomePage.tsx)                           | Search, result cards, and the referral flow                                        |
| [src/practitioners.ts](./src/practitioners.ts)                               | Reads the bot's Bundle (pairs each Practitioner with its role) and saves a doctor  |
| [src/referral.ts](./src/referral.ts)                                         | Lists your patients, builds and saves referrals, and checks for existing referrals |
| [src/components/PractitionerCard.tsx](./src/components/PractitionerCard.tsx) | One result card                                                                    |
| [src/components/ReferDialog.tsx](./src/components/ReferDialog.tsx)           | Patient picker, duplicate warning, and submit                                      |

## Getting Started

### 1. Deploy the `nppes-lookup` bot

Your Medplum project must have the `bots` feature enabled.

1. In the Medplum app, open **Project Admin**, click **Create new Bot**, and name it `nppes-lookup`.
2. In the **Editor** tab, paste in [`examples/medplum-demo-bots/src/nppes-lookup.ts`](../medplum-demo-bots/src/nppes-lookup.ts), then **Save** and **Deploy**.

The app looks the bot up by its exact name, `MEDPLUM_NPPES_BOT_NAME` (default `nppes-lookup`, see `.env.defaults`). See [Bot Basics](https://www.medplum.com/docs/bots/bot-basics) or [deploy from the command line](https://www.medplum.com/docs/bots/bots-in-production#deploying-your-bot).

### 2. Assign patients to yourself

The referral dialog lists only patients whose `Patient.generalPractitioner` is your `Practitioner`. Set that on a few test patients.

### 3. Run the app

```bash
cp .env.defaults .env
npm install
npm run dev
```

The app runs on `http://localhost:3000` and connects to `https://api.medplum.com/` by default. For a local Medplum server, set `MEDPLUM_BASE_URL=http://localhost:8103/` in `.env`. Sign in with a user whose profile is a `Practitioner`.

### Things to try

| Action                                          | Result                                                                   |
| ----------------------------------------------- | ------------------------------------------------------------------------ |
| Last name `smith`, state `NY`                   | Cards for matching providers                                             |
| State `NY` only                                 | "Lookup failed": NPPES requires another search field                     |
| NPI `123`                                       | "Lookup failed": the bot requires a 10-digit NPI                         |
| **Select** a card, pick a patient, **Submit**   | "Referral saved"; the saved resources are logged in the browser console  |
| Refer the same patient to the same doctor again | "Already referred" warning, and the button reads "Send another referral" |

## How saving works

- **Doctor**: the `Practitioner` is created only if none has that NPI, so an existing record (for example a user's own profile) is never overwritten. The `PractitionerRole` is then update-or-created by the identifier the bot puts on it (`https://medplum.com/fhir/nppes-practitioner-role` | NPI). Saving the same doctor again creates no copies. Names are stored in NPPES's upper case and formatted only for display. The app reuses the identifiers from the bot's Bundle and defines no FHIR systems of its own.
- **Referral**: a `ServiceRequest` with `requester` = you, `performer` = the doctor's role, `subject` = the patient, and `performerType` = the doctor's primary NUCC specialty.
- **Duplicate protection**:
  - _Same referral submitted twice_ (double-click, retry): each referral gets a unique ID when you click **Select** and is saved with a conditional create on that ID.
  - _Patient already referred to this doctor_: the dialog looks up the patient's open referrals (`active`, `draft`, `on-hold`) from anyone and matches the recipient by NPI. This only warns; it does not block sending.

## Possible next steps

- **Default search fields per project.** Let each project prefill search fields (for example a ZIP code) without code changes: store them as a [project secret](https://www.medplum.com/docs/bots/bot-secrets) such as `NPPES_DEFAULTS` = `{"postal_code": "941*"}`, and have the bot merge them under the caller's input so caller values win. Decide whether a caller can clear a default, and whether defaults alone count as a search.
- **Send the referral by eFax.** Generate a referral PDF (`Binary` + `DocumentReference`), create a fax `Communication` linked to the `ServiceRequest`, call `$send-efax`, and track delivery with `$sync-efax-status`. Requires the eFax integration on the project. Test only with a fax number you control.
- **Refresh saved doctors from NPPES.** An existing `Practitioner` is never updated, so NPPES changes (such as a new address) don't reach it. Patch only the NPPES-derived fields to keep it current without overwriting other data.
- **Care teams instead of `generalPractitioner`.** Switch "my patients" to `CareTeam` to support patients shared by several clinicians. Only `getMyPatients` in `src/referral.ts` needs to change.
- **Server-side referrals and access control.** Move saving into a bot that re-fetches the doctor by NPI and uses the caller from `event.requester`, and use an `AccessPolicy` so practitioners cannot write these resources directly.
- **Organizations and credentials.** Map organizations (NPI-2) to `Organization`, and credentials and licenses to `Practitioner.qualification`.

## About Medplum

[Medplum](https://www.medplum.com/) is an open-source, API-first EHR. Medplum makes it easy to build healthcare apps quickly with less code.

- Read our [documentation](https://www.medplum.com/docs)
- Browse our [react component library](https://storybook.medplum.com/)
- Join our [Discord](https://discord.gg/medplum)
