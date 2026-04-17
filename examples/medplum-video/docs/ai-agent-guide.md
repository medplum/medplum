# AI Agent Guide

## Overview

AI agents are LiveKit participants that join video rooms, process audio, and write FHIR
resources back to Medplum. They use the same `@medplum/core` SDK and `@medplum/fhirtypes`
as bots and React components — full type safety across the stack.

## Agent Types

### Scribe Agent

- **Role**: Silent observer and transcriber
- **Pipeline**: Audio → Deepgram STT → transcript text → FHIR Communication
- **Output**: Real-time transcript chunks + structured clinical note (DocumentReference)
- **Joins**: When encounter reaches `in-progress`

### Intake Agent

- **Role**: Voice-interactive pre-visit assistant
- **Pipeline**: Audio → Deepgram STT → OpenAI/Claude LLM → Cartesia TTS → Audio
- **Output**: QuestionnaireResponse with intake data
- **Joins**: When patient enters waiting room (before provider)

### Coding Agent

- **Role**: Post-visit code suggester
- **Pipeline**: Reads clinical note DocumentReference → LLM → code suggestions
- **Output**: DocumentReference with ICD-10/CPT suggestions
- **Runs**: After encounter reaches `finished`

## Creating a Custom Agent

1. Extend `MedplumBaseAgent`:

```typescript
import { MedplumClient } from '@medplum/core';
import { MedplumBaseAgent } from './medplum-agent';

export class MyAgent extends MedplumBaseAgent {
  constructor(medplum: MedplumClient) {
    super(medplum);
    this.instructions = 'Your agent instructions here...';
  }

  override async onRoomJoined(roomMetadata: string | undefined): Promise<void> {
    await super.onRoomJoined(roomMetadata);
    // Your initialization logic
  }
}
```

2. Register in `entrypoint.ts`:

```typescript
case 'my-agent':
  return new MyAgent(medplum);
```

3. Set room metadata to dispatch your agent:

```json
{ "agentType": "my-agent" }
```

## FHIR Resources Written by Agents

### Communication (real-time transcript)

Written by ScribeAgent during the visit. Each chunk includes:

- `encounter` reference
- `payload[0].contentString` — transcript text
- Extension `transcript-speaker` — "patient", "provider", "unknown"
- Extension `transcript-timestamp` — precise timestamp

### DocumentReference (clinical notes)

Written post-visit with `status: preliminary`:

- `type` — LOINC code 75476-2 (Physician Note)
- `category` — `ai-scribe-transcript` or `ai-clinical-note`
- `content[0].attachment` — points to a Binary with markdown content
- Extension `ai-agent-source` — identifier of the agent that produced it

### QuestionnaireResponse (intake data)

Written by IntakeAgent:

- `subject` — patient reference
- `encounter` — encounter reference
- `item[]` — question/answer pairs from intake conversation

## Authentication

Agents authenticate with `MedplumClient.startClientLogin()` using a service
account (ClientApplication). The service account should have the "Video Visit
AI Agent" AccessPolicy applied, which scopes access to:

- Encounter (VR class only)
- Communication (read/write)
- DocumentReference (read/write)
- Binary (read/write)
- Patient (read-only)
- Practitioner (read-only)
