// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { MedplumClient } from '@medplum/core';
import { MedplumBaseAgent } from './medplum-agent';

interface TranscriptSegment {
  speaker: string;
  text: string;
  timestamp: string;
}

const SCRIBE_INSTRUCTIONS = `You are a medical scribe AI. You are listening to a clinical encounter
between a healthcare provider and a patient. Your job is to:

1. Produce accurate real-time transcription with speaker labels
2. At the end of the visit, generate a structured clinical note with:
   - Chief Complaint
   - History of Present Illness (HPI)
   - Review of Systems (ROS)
   - Assessment
   - Plan

You do NOT speak during the visit. You are a silent observer and transcriber.`;

/**
 * Scribe Agent — listens to audio, transcribes in real-time, and
 * generates a structured clinical note when the visit ends.
 *
 * Uses the STT pipeline (Deepgram) via LiveKit Agents to capture
 * transcript segments, then writes them as FHIR Communication
 * resources for the Provider App's live transcript panel.
 */
export class ScribeAgent extends MedplumBaseAgent {
  private transcriptBuffer: TranscriptSegment[] = [];

  /**
   * Creates a new ScribeAgent.
   * @param medplum - Authenticated MedplumClient instance.
   */
  constructor(medplum: MedplumClient) {
    super(medplum);
    this.instructions = SCRIBE_INSTRUCTIONS;
  }

  /**
   * Called when the agent joins a LiveKit room. Activates listening mode.
   * @param roomMetadata - JSON-encoded room metadata.
   * @returns A promise that resolves when the room has been joined.
   */
  override async onRoomJoined(roomMetadata: string | undefined): Promise<void> {
    await super.onRoomJoined(roomMetadata);
    console.log('Scribe agent active — listening mode');
  }

  /**
   * Called by the STT pipeline when a transcript segment is produced.
   * Writes to FHIR in real-time so the Provider App can show live transcript.
   * @param speaker - The speaker label (e.g. 'patient' or 'provider').
   * @param text - The transcribed text content.
   * @returns A promise that resolves when the transcript chunk has been persisted.
   */
  async handleTranscription(speaker: string, text: string): Promise<void> {
    const segment: TranscriptSegment = {
      speaker,
      text,
      timestamp: new Date().toISOString(),
    };
    this.transcriptBuffer.push(segment);

    await this.writeTranscriptChunk(speaker, text);
  }

  /**
   * Called when the visit ends (room disconnect or explicit signal).
   * Assembles full transcript and generates a structured clinical note.
   * @returns A promise that resolves when both the transcript and clinical note have been written.
   */
  async generateClinicalNote(): Promise<void> {
    const fullTranscript = this.transcriptBuffer.map((s) => `[${s.speaker}] ${s.text}`).join('\n');

    const today = new Date().toISOString().split('T')[0];

    await this.writeDocument(
      `Visit Transcript — ${today}`,
      fullTranscript,
      '75476-2',
      'ai-scribe-transcript'
    );

    await this.writeDocument(
      `AI Clinical Note — ${today}`,
      `# Clinical Note\n\n_AI-generated — provider review required_\n\n## Transcript\n\n${fullTranscript}`,
      '75476-2',
      'ai-clinical-note'
    );
  }
}
