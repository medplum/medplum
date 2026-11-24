# Medplum Radiology Demo

A radiologist reading worklist built on Medplum primitives: pick a study from the worklist, dictate a
`DiagnosticReport` with voice input, and resume the draft later.

## What it shows

- **Worklist** — `Task` resources tagged with the `https://medplum.com/radiology-dictation` identifier, listed in a
  pane that stays mounted while you switch between reports.
- **Report creator** — voice-to-text dictation via the `useWhisper` hook from `@medplum/react`, alongside the patient
  chart (`PatientSummary`) for the selected study.
- **Resumable drafts** — opening a Task creates a blank `DiagnosticReport` identified by that Task, so reopening it
  later picks the same draft back up. Nothing else is written until you save, so switching studies discards unsaved
  dictation.
- **FHIRcast** — a small panel to connect to a topic and follow `ImagingStudy-open`, `ImagingStudy-close`, and
  `syncerror` events. While connected, selecting a worklist item publishes the context change too: the outgoing study
  is closed before the incoming one is opened, so subscribers such as a PACS viewer follow along.

Voice input requires the `ai-realtime` feature on your Medplum project.

## Getting started

```sh
npm install
npm run dev
```

Set `MEDPLUM_BASE_URL` in `.env` (copied from `.env.defaults` on first run).

## Seeding the worklist

Create a reading task from a patient and an imaging study:

```sh
export MEDPLUM_BASE_URL=http://localhost:8103/
export MEDPLUM_CLIENT_ID=<client-id>
export MEDPLUM_CLIENT_SECRET=<client-secret>

npm run generate-task -- Patient/123 ImagingStudy/456
```

The new `Task` shows up in the worklist immediately.
