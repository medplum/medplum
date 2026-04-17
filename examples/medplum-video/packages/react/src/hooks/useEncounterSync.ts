// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { useSubscription } from '@medplum/react-hooks';
import type { Bundle, Communication } from '@medplum/fhirtypes';
import { useState } from 'react';
import { EXT } from '../utils/livekit-config';

export interface TranscriptChunk {
  speaker: string;
  text: string;
  timestamp: string;
}

/**
 * Keeps the UI in sync with live transcript data via Medplum WebSocket subscriptions.
 *
 * Subscribes to Communication resources linked to the encounter, parsing
 * transcript-speaker and transcript-timestamp extensions into a flat array
 * of chunks suitable for rendering in a transcript panel.
 *
 * @param encounterId - The FHIR Encounter ID to subscribe to.
 * @returns An object containing the accumulated transcript chunks.
 */
export function useEncounterSync(encounterId: string): { transcriptChunks: TranscriptChunk[] } {
  const [transcriptChunks, setTranscriptChunks] = useState<TranscriptChunk[]>([]);

  useSubscription(
    `Communication?encounter=Encounter/${encounterId}&_sort=-_lastUpdated`,
    (bundle: Bundle) => {
      const entries = bundle.entry ?? [];
      for (const entry of entries) {
        const comm = entry.resource as Communication;
        if (comm?.payload?.[0]?.contentString) {
          setTranscriptChunks((prev) => [
            ...prev,
            {
              speaker:
                comm.extension?.find((e) => e.url === EXT.transcriptSpeaker)?.valueString ?? 'unknown',
              text: comm.payload?.[0]?.contentString ?? '',
              timestamp:
                comm.extension?.find((e) => e.url === EXT.transcriptTimestamp)?.valueInstant ??
                new Date().toISOString(),
            },
          ]);
        }
      }
    }
  );

  return { transcriptChunks };
}
