// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
//
// Code samples for /docs/provider/spaces.mdx.
// Each example has up to three blocks: <name>Ts (live TypeScript), <name>Cli
// (commented `medplum` CLI invocation), <name>Curl (commented HTTP request).
// Non-TypeScript blocks live inside /* */ comments so this file still compiles.

// start-block imports
import { MedplumClient } from '@medplum/core';
import type { Communication, Parameters, Project } from '@medplum/fhirtypes';
// end-block imports

const medplum = new MedplumClient();

// start-block enableFeaturesTs
// Read the current project, then patch its features list.
const project = await medplum.searchOne('Project');
if (!project?.id) {
  throw new Error('No accessible Project found');
}
const existingFeatures = project.features ?? [];
const required: NonNullable<Project['features']> = ['ai', 'bots'];
const features = Array.from(new Set([...existingFeatures, ...required]));
await medplum.updateResource<Project>({ ...project, features });
// end-block enableFeaturesTs

/*
// start-block enableFeaturesCli
medplum project update --features ai,bots
// end-block enableFeaturesCli
*/

// start-block addOpenAiSecretTs
// Add OPENAI_API_KEY to the project secret list.
const projectForSecret = await medplum.searchOne('Project');
if (!projectForSecret?.id) {
  throw new Error('No accessible Project found');
}
const otherSecrets = (projectForSecret.secret ?? []).filter((s) => s.name !== 'OPENAI_API_KEY');
await medplum.updateResource<Project>({
  ...projectForSecret,
  secret: [...otherSecrets, { name: 'OPENAI_API_KEY', valueString: 'sk-...' }],
});
// end-block addOpenAiSecretTs

/*
// start-block addOpenAiSecretCli
medplum project secret set OPENAI_API_KEY 'sk-...'
// end-block addOpenAiSecretCli
*/

/*
// start-block deployBotsCli
# From examples/medplum-demo-bots, deploy each Spaces bot with its identifier.
# Repeat for each of the four bots; replace <bot-name> with the source filename
# and <identifier-value> with the identifier value from the table.
medplum bot create \
  --name '<bot-name>' \
  --source 'src/spaces-bots/<bot-name>.ts' \
  --identifier 'https://www.medplum.com/bots|<identifier-value>'

medplum bot deploy '<bot-name>'
// end-block deployBotsCli
*/

// start-block seedSystemPromptTs
// One-time setup: create the Communication that holds the translator's system
// prompt and profile-context template. payload[0] is the system prompt;
// payload[1] is a profile-context template where {{ref}} is substituted with
// the requester's reference string at request time.
await medplum.createResource<Communication>({
  resourceType: 'Communication',
  status: 'completed',
  identifier: [
    {
      system: 'http://medplum.com/ai-spaces',
      value: 'ai-fhir-request-tools',
    },
  ],
  payload: [
    {
      contentString: [
        'You are a FHIR data assistant for Medplum.',
        'Use the fhir_request tool for every FHIR operation - never invent results.',
        'For updates, first GET the resource, then PUT the modified full resource.',
        'Set visualize=true on the tool call when the result should be a chart',
        '(e.g. growth trends, lab values over time, observation series).',
      ].join('\n'),
    },
    {
      contentString: 'The requester is {{ref}}. Scope queries to data they are entitled to see.',
    },
  ],
});
// end-block seedSystemPromptTs

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
