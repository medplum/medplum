// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { MedplumClient } from '@medplum/core';
import type { Binary, Communication, DocumentReference } from '@medplum/fhirtypes';

/**
 * Base class for all Medplum-aware LiveKit agents.
 *
 * Provides:
 *  - Authenticated MedplumClient (same SDK used by bots and frontend)
 *  - Encounter context extracted from LiveKit room metadata
 *  - Helper methods to write FHIR Communication (transcript) and DocumentReference (notes)
 *
 * Subclasses override `onRoomJoined()` to implement agent-specific behavior.
 * This is a framework-agnostic base — the LiveKit Agent SDK's lifecycle hooks
 * call into these methods.
 */
export class MedplumBaseAgent {
  protected medplum: MedplumClient;
  protected encounterId: string | undefined;
  protected patientReference: string | undefined;
  public instructions: string;

  /**
   * Creates a new MedplumBaseAgent.
   * @param medplum - Authenticated MedplumClient instance.
   */
  constructor(medplum: MedplumClient) {
    this.medplum = medplum;
    this.instructions = 'You are a healthcare AI assistant participating in a video visit.';
  }

  /**
   * Called when the agent joins a LiveKit room.
   * Extracts encounter context from room metadata.
   * @param roomMetadata - JSON-encoded room metadata containing encounterId and patientId.
   * @returns A promise that resolves when the room metadata has been processed.
   */
  async onRoomJoined(roomMetadata: string | undefined): Promise<void> {
    if (roomMetadata) {
      const meta = JSON.parse(roomMetadata) as { encounterId?: string; patientId?: string };
      this.encounterId = meta.encounterId;
      this.patientReference = meta.patientId;
      console.log(`Agent joined room for Encounter/${this.encounterId}`);
    }
  }

  /**
   * Write a real-time transcript chunk as a FHIR Communication resource.
   * The Provider App picks these up via `useSubscription('Communication?encounter=...')`.
   * @param speaker - The speaker label (e.g. 'patient' or 'provider').
   * @param text - The transcribed text content.
   * @returns A promise that resolves when the Communication resource has been created.
   */
  protected async writeTranscriptChunk(speaker: string, text: string): Promise<void> {
    if (!this.encounterId) {return;}

    await this.medplum.createResource<Communication>({
      resourceType: 'Communication',
      status: 'completed',
      encounter: { reference: `Encounter/${this.encounterId}` },
      sender: { display: `AI Agent: ${this.constructor.name}` },
      payload: [{ contentString: text }],
      extension: [
        {
          url: 'https://medplum.com/fhir/StructureDefinition/transcript-speaker',
          valueString: speaker,
        },
        {
          url: 'https://medplum.com/fhir/StructureDefinition/transcript-timestamp',
          valueInstant: new Date().toISOString(),
        },
      ],
    });
  }

  /**
   * Write a document (clinical note, transcript) as Binary + DocumentReference.
   * Uses `docStatus: preliminary` so providers know it needs review.
   * @param title - The document title.
   * @param markdownContent - The markdown body of the document.
   * @param loincCode - The LOINC code for the document type.
   * @param categoryCode - The Medplum document category code.
   * @returns The created DocumentReference resource.
   */
  protected async writeDocument(
    title: string,
    markdownContent: string,
    loincCode: string,
    categoryCode: string
  ): Promise<DocumentReference> {
    if (!this.encounterId || !this.patientReference) {
      throw new Error('Cannot write document without encounter and patient context');
    }

    const binary = await this.medplum.createResource<Binary>({
      resourceType: 'Binary',
      contentType: 'text/markdown',
      data: Buffer.from(markdownContent).toString('base64'),
    });

    return this.medplum.createResource<DocumentReference>({
      resourceType: 'DocumentReference',
      status: 'current',
      docStatus: 'preliminary',
      type: {
        coding: [{ system: 'http://loinc.org', code: loincCode }],
      },
      category: [
        {
          coding: [
            {
              system: 'https://medplum.com/fhir/CodeSystem/document-category',
              code: categoryCode,
            },
          ],
        },
      ],
      subject: { reference: this.patientReference },
      context: { encounter: [{ reference: `Encounter/${this.encounterId}` }] },
      content: [
        {
          attachment: {
            contentType: 'text/markdown',
            url: `Binary/${binary.id}`,
            title,
          },
        },
      ],
      extension: [
        {
          url: 'https://medplum.com/fhir/StructureDefinition/ai-agent-source',
          valueString: this.constructor.name,
        },
      ],
    });
  }
}
