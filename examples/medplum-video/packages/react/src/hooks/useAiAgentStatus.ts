// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { useRoomContext } from '@livekit/components-react';
import { useState, useEffect } from 'react';
import { RoomEvent } from 'livekit-client';

interface AiAgentInfo {
  identity: string;
  name: string;
  agentType: string;
}

/**
 * Tracks AI agent participants in the LiveKit room.
 *
 * Looks at participant metadata for `role === 'ai-agent'` and surfaces
 * a list of active AI agents. Useful for showing indicators like
 * "AI Scribe is listening" in the UI.
 *
 * @returns An object with the `agents` array and a boolean `hasActiveAgents`.
 */
export function useAiAgentStatus(): { agents: AiAgentInfo[]; hasActiveAgents: boolean } {
  const room = useRoomContext();
  const [agents, setAgents] = useState<AiAgentInfo[]>([]);

  useEffect(() => {
    function updateAgents(): void {
      const aiAgents: AiAgentInfo[] = [];
      for (const participant of room.remoteParticipants.values()) {
        try {
          const meta = JSON.parse(participant.metadata ?? '{}') as { role?: string; agentType?: string };
          if (meta.role === 'ai-agent') {
            aiAgents.push({
              identity: participant.identity,
              name: participant.name ?? participant.identity,
              agentType: meta.agentType ?? 'unknown',
            });
          }
        } catch {
          // skip participants with invalid metadata
        }
      }
      setAgents(aiAgents);
    }

    updateAgents();

    room.on(RoomEvent.ParticipantConnected, updateAgents);
    room.on(RoomEvent.ParticipantDisconnected, updateAgents);
    room.on(RoomEvent.ParticipantMetadataChanged, updateAgents);

    return () => {
      room.off(RoomEvent.ParticipantConnected, updateAgents);
      room.off(RoomEvent.ParticipantDisconnected, updateAgents);
      room.off(RoomEvent.ParticipantMetadataChanged, updateAgents);
    };
  }, [room]);

  return { agents, hasActiveAgents: agents.length > 0 };
}
