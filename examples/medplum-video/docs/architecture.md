# Architecture

## Design Principles

1. **FHIR-native**: All video visit state modeled in FHIR R4. No sidecar databases.
2. **All-TypeScript**: Bots, agents, React components, and FHIR types — one language, shared types.
3. **Self-hosted video**: LiveKit Server runs on your infrastructure. No third-party video data processor.
4. **Plug-in AI**: Agents join as LiveKit participants. Add/remove agent types without changing video infra.
5. **Medplum-first**: Room provisioning via Bots + Subscriptions. Token generation server-side. FHIR AccessPolicies for security.

## Data Flow

### Scheduled Visit

1. **Appointment booked** → Encounter created with `status: planned`, `class: VR`
2. **Patient checks in** → Encounter status → `arrived` → Subscription fires `create-video-room` bot
3. **LiveKit room created** → Room name/SID stored as Encounter extensions
4. **Patient joins** → Frontend calls `generate-token` bot → gets waiting-room-restricted token
5. **Patient enters WaitingRoom** → Connected but `canPublish: false`
6. **Provider clicks Admit** → `admit-patient` bot → Encounter → `in-progress`, patient gets publish permissions
7. **Visit proceeds** → AI Scribe agent transcribes → Communication resources created in real-time
8. **Visit ends** → Encounter → `finished` → LiveKit room closed → `post-visit-summarize` bot creates DocumentReference

### Ad-hoc Visit

1. **Provider clicks "Start Ad-Hoc Visit"** → `start-adhoc-visit` bot creates Encounter with `status: arrived`
2. Steps 2-8 same as scheduled (Subscription handles room creation)

## Component Architecture

### React Layer (`@medplum-video/react`)

- **Hooks**: `useVideoVisit` (lifecycle), `useEncounterSync` (transcript), `useLiveKitToken` (token), `useAiAgentStatus` (agent tracking)
- **Components**: `VideoRoom`, `WaitingRoom`, `VideoLobby`, `VideoControls`, `ParticipantView`, `AiAgentIndicator`
- **Patient components**: `PatientVideoVisitPage`, `UpcomingVideoVisits`

### Bot Layer (`@medplum-video/bots`)

- **`create-video-room`**: Creates LiveKit room, stores metadata on Encounter
- **`generate-token`**: Issues LiveKit tokens with role-based permissions
- **`admit-patient`**: Transitions waiting → in-progress, upgrades LiveKit permissions
- **`start-adhoc-visit`**: Creates ad-hoc Encounter → triggers room creation
- **`on-encounter-status-change`**: Handles lifecycle transitions, room cleanup
- **`post-visit-summarize`**: Assembles transcript, creates AI clinical note

### Agent Layer (`@medplum-video/agents`)

- **`MedplumBaseAgent`**: Base class with `MedplumClient` and FHIR write helpers
- **`ScribeAgent`**: Silent observer, real-time transcript, clinical note generation
- **`IntakeAgent`**: Voice-interactive pre-visit intake
- **`CodingAgent`**: Post-visit ICD-10/CPT code suggestions

## Security Model

- LiveKit credentials stored as Medplum Bot secrets — never exposed to client
- AI agents authenticate via `MedplumClient.startClientLogin()` with scoped AccessPolicy
- Patients receive restricted tokens (`canPublish: false`) until provider admits
- All FHIR operations create AuditEvent entries automatically
- AI-generated documents use `status: preliminary` — require provider review before finalization
