// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import React from 'react';
import { Badge, Group, Text } from '@mantine/core';
import { useAiAgentStatus } from '../hooks/useAiAgentStatus';

/**
 * Displays active AI agents in the video room.
 * Shows a badge per agent (e.g. "AI Scribe — listening").
 * Only renders inside a LiveKitRoom context.
 *
 * @returns A React element with agent badges, or null if no agents are active.
 */
export function AiAgentIndicator(): React.JSX.Element | null {
  const { agents, hasActiveAgents } = useAiAgentStatus();

  if (!hasActiveAgents) {
    return null;
  }

  return (
    <Group gap="xs" className="medplum-ai-agent-indicator">
      {agents.map((agent) => (
        <Badge key={agent.identity} variant="dot" color="violet" size="lg">
          <Text size="xs" component="span">
            {agent.name} — {agent.agentType}
          </Text>
        </Badge>
      ))}
    </Group>
  );
}
