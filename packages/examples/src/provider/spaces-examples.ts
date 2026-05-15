// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
//
// Code samples for /docs/provider/spaces.mdx.
// Each example has up to three blocks: <name>Ts (live TypeScript), <name>Cli
// (commented `medplum` CLI invocation), <name>Curl (commented HTTP request).
// Non-TypeScript blocks live inside /* */ comments so this file still compiles.

// start-block imports
import { MedplumClient } from '@medplum/core';
import type { Communication, Parameters } from '@medplum/fhirtypes';
// end-block imports

const medplum = new MedplumClient();

// start-block seedSystemPromptsTs
// One-time setup: create the three Communications that hold the system prompts
// for the translator, summary, and visualizer bots. The bodies below are a
// thin wiring skeleton - the loop runs end-to-end with these in place, but
// you should replace each payload[0].contentString with prompts authored for
// your deployment before exposing Spaces to users.

// Translator: produces the fhir_request tool calls that drive the loop.
await medplum.createResource<Communication>({
  resourceType: 'Communication',
  status: 'completed',
  identifier: [{ system: 'http://medplum.com/ai-spaces', value: 'ai-fhir-request-tools' }],
  payload: [
    {
      contentString: [
        'You are a FHIR data assistant for Medplum.',
        'Use the fhir_request tool for every FHIR operation - never invent results.',
        'For updates, first GET the resource, then PUT the modified full resource.',
        'Set visualize=true on the tool call when the result should be a chart',
        '(for example trends or values over time).',
      ].join('\n'),
    },
    {
      // payload[1] is a profile-context template; {{ref}} is replaced at request
      // time with the requester's reference string (e.g. Practitioner/abc-123).
      contentString: 'The requester is {{ref}}. Scope queries to data they are entitled to see.',
    },
  ],
});

// Summary: narrates the FHIR responses the translator collected.
await medplum.createResource<Communication>({
  resourceType: 'Communication',
  status: 'completed',
  identifier: [{ system: 'http://medplum.com/ai-spaces', value: 'ai-resource-summary-sse' }],
  payload: [
    {
      contentString: [
        'You translate FHIR response bundles into clear, human-readable summaries.',
        'Lead with the most clinically relevant detail. Be concise.',
        'If the response is an empty bundle, say so plainly and suggest what to try next.',
      ].join('\n'),
    },
  ],
});

// Visualizer: produces a self-contained Chart() React component when asked.
await medplum.createResource<Communication>({
  resourceType: 'Communication',
  status: 'completed',
  identifier: [{ system: 'http://medplum.com/ai-spaces', value: 'ai-component-generator-sse' }],
  payload: [
    {
      contentString: [
        'You generate a self-contained function Chart() React component that visualizes FHIR data.',
        'Use only the Recharts and Mantine components already in scope - do not write import statements.',
        'Prefer LineChart or AreaChart for trends over time and BarChart or PieChart for categorical counts.',
      ].join('\n'),
    },
  ],
});
// end-block seedSystemPromptsTs

// start-block updateSystemPromptTs
// To tune the translator at runtime, edit payload[0].contentString on the
// existing Communication. The next user message picks up the new prompt
// without redeploying any bot.
const existing = await medplum.searchOne('Communication', {
  identifier: 'http://medplum.com/ai-spaces|ai-fhir-request-tools',
});
if (existing?.id) {
  await medplum.updateResource<Communication>({
    ...existing,
    payload: [
      {
        contentString: [
          'You are a FHIR data assistant for Medplum.',
          'Use the fhir_request tool for every FHIR operation.',
          'When the user asks about vitals, prefer Observation searches that include both code and date.',
        ].join('\n'),
      },
      existing.payload?.[1] ?? { contentString: 'The requester is {{ref}}.' },
    ],
  });
}
// end-block updateSystemPromptTs

// start-block loadRecentTopicsTs
// Topic headers carry identifier ai-message-topic. The Provider UI filters by
// the current user's reference so each user only sees their own conversations.
const profile = await medplum.getProfile();
const topics = await medplum.searchResources('Communication', {
  identifier: 'http://medplum.com/ai-message|ai-message-topic',
  sender: profile?.id ? `${profile.resourceType}/${profile.id}` : '',
  _sort: '-_lastUpdated',
  _count: '10',
});
console.log(topics);
// end-block loadRecentTopicsTs

// start-block loadConversationMessagesTs
// Each turn is a child Communication linked via partOf. payload[0].contentString
// is JSON of { role, content, tool_calls, tool_call_id, resources, componentCode, sequenceNumber }.
const topicId = 'example-topic-id';
const messages = await medplum.searchResources('Communication', {
  'part-of': `Communication/${topicId}`,
  _sort: '_lastUpdated',
  _count: '100',
});
const turns = messages
  .filter((m) => m.payload?.[0]?.contentString)
  .map((m) => JSON.parse(m.payload?.[0]?.contentString as string))
  .sort((a, b) => (a.sequenceNumber ?? 0) - (b.sequenceNumber ?? 0));
console.log(turns);
// end-block loadConversationMessagesTs

// start-block invokeTranslatorBotTs
// Direct invocation of the translator bot. The Provider UI does this on every
// loop iteration; you only need this snippet to build your own client.
const translatorResponse = await medplum.executeBot(
  { system: 'https://www.medplum.com/bots', value: 'ai-fhir-request-tools' },
  {
    resourceType: 'Parameters',
    parameter: [
      {
        name: 'messages',
        valueString: JSON.stringify([{ role: 'user', content: 'Find the patient named John Smith' }]),
      },
      { name: 'model', valueString: 'gpt-4' },
    ],
  } satisfies Parameters
);
console.log(translatorResponse);
// end-block invokeTranslatorBotTs
