// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { cleanNotifications } from '@mantine/notifications';
import {
  allOk,
  clearAgentSettingsSchemaCache,
  clearReleaseCache,
  ContentType,
  getReferenceString,
  getStatus,
  isOperationOutcome,
  MEDPLUM_RELEASES_URL,
} from '@medplum/core';
import type { Agent, AgentSetting } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import type { ReactNode } from 'react';
import type * as ReactDom from 'react-dom';
import type { Mock } from 'vitest';
import { vi } from 'vitest';
import { act, fireEvent, renderAppRoutes, screen } from '../test-utils/render';

vi.mock('react-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof ReactDom>();
  return {
    ...actual,
    createPortal: (children: ReactNode) => <>{children}</>,
  };
});

const AGENT_VERSION = '3.2.13';
const LATEST_VERSION = '3.2.14';

// The schema for LATEST has one extra setting (logStatsFreqSecs) so we can prove that switching the
// schema-version dropdown re-renders the form against a different version.
function schemaFor(version: string): Record<string, unknown> {
  const settings = [
    { name: 'keepAlive', type: 'boolean', label: 'Keep Alive', category: 'Connection', default: false },
    {
      name: 'maxClientsPerRemote',
      type: 'integer',
      label: 'Max Clients Per Remote',
      category: 'Connection',
      default: 5,
      min: 1,
    },
    { name: 'durableQueue', type: 'boolean', label: 'Durable Queue', category: 'Durable Queue', default: false },
    {
      name: 'queueDbPath',
      type: 'string',
      label: 'Queue Database Path',
      category: 'Durable Queue',
      visibleWhen: [{ setting: 'durableQueue', equals: true }],
    },
  ];
  if (version === LATEST_VERSION) {
    settings.push({
      name: 'logStatsFreqSecs',
      type: 'integer',
      label: 'Log Stats Frequency',
      category: 'Connection',
      default: -1,
    } as (typeof settings)[number]);
  }
  return { agentVersion: version, settings };
}

function releaseManifest(version: string): Record<string, unknown> {
  return {
    tag_name: `v${version}`,
    assets: [
      {
        name: 'agent-settings-schema.json',
        browser_download_url: `https://download.medplum.com/releases/v${version}/agent-settings-schema.json`,
      },
    ],
  };
}

function mockFetch(status: number, body: (url: string) => any, contentType = ContentType.JSON): Mock {
  return vi.fn((url: string) => {
    const response = body(url);
    const responseStatus = isOperationOutcome(response) ? getStatus(response) : status;
    return Promise.resolve({
      ok: responseStatus < 400,
      status: responseStatus,
      headers: new Headers({ 'content-type': contentType }),
      json: () => Promise.resolve(response),
      blob: () => Promise.resolve(response),
    });
  });
}

// Standard fetch mock: serves the `latest` manifest, per-version manifests, and the schema asset.
function standardFetch(): Mock {
  return mockFetch(200, (url) => {
    if (url.startsWith(`${MEDPLUM_RELEASES_URL}/latest`)) {
      return releaseManifest(LATEST_VERSION);
    }
    const versionMatch = url.match(/\/v(\d+\.\d+\.\d+)\.json/);
    if (url.startsWith(MEDPLUM_RELEASES_URL) && versionMatch) {
      return releaseManifest(versionMatch[1]);
    }
    const schemaMatch = url.match(/releases\/v(\d+\.\d+\.\d+)\/agent-settings-schema\.json/);
    if (schemaMatch) {
      return schemaFor(schemaMatch[1]);
    }
    throw new Error(`Unexpected fetch URL: ${url}`);
  });
}

describe('AgentConfigPage', () => {
  let medplum: MockClient;
  let agent: Agent;

  async function setupAgent(statusVersion: string, setting?: AgentSetting[]): Promise<void> {
    medplum = new MockClient();
    medplum.router.router.add('GET', 'Agent/:id/$status', async () => [
      allOk,
      {
        resourceType: 'Parameters',
        parameter: [
          { name: 'status', valueCode: 'connected' },
          { name: 'version', valueString: statusVersion },
        ],
      },
    ]);
    agent = await medplum.createResource<Agent>({
      resourceType: 'Agent',
      name: 'Agent Config Test',
      status: 'active',
      setting,
    });
  }

  beforeEach(() => {
    clearReleaseCache();
    clearAgentSettingsSchemaCache();
    globalThis.fetch = standardFetch();
  });

  afterEach(() => {
    act(() => {
      cleanNotifications();
    });
  });

  test('Renders settings form for the agent version by default', async () => {
    await setupAgent(AGENT_VERSION);
    renderAppRoutes(medplum, `/${getReferenceString(agent)}/config`);

    expect(await screen.findByText('Keep Alive')).toBeInTheDocument();
    expect(screen.getByText('Max Clients Per Remote')).toBeInTheDocument();

    // The schema-version dropdown defaults to the agent's reported version.
    expect(screen.getByDisplayValue(`${AGENT_VERSION} (agent)`)).toBeInTheDocument();
  });

  test('Hides visibleWhen-gated settings until their condition is met', async () => {
    await setupAgent(AGENT_VERSION);
    renderAppRoutes(medplum, `/${getReferenceString(agent)}/config`);

    // "Durable Queue" is also a category heading, so target the checkbox specifically.
    expect(await screen.findByRole('checkbox', { name: 'Durable Queue' })).toBeInTheDocument();
    // queueDbPath is gated on durableQueue === true
    expect(screen.queryByText('Queue Database Path')).not.toBeInTheDocument();

    act(() => {
      fireEvent.click(screen.getByRole('checkbox', { name: 'Durable Queue' }));
    });

    expect(await screen.findByText('Queue Database Path')).toBeInTheDocument();
  });

  test('Switching the schema version re-renders against that version', async () => {
    await setupAgent(AGENT_VERSION);
    renderAppRoutes(medplum, `/${getReferenceString(agent)}/config`);

    // logStatsFreqSecs only exists in the LATEST schema, not the agent's version.
    expect(await screen.findByText('Keep Alive')).toBeInTheDocument();
    expect(screen.queryByText('Log Stats Frequency')).not.toBeInTheDocument();

    act(() => {
      fireEvent.click(screen.getByDisplayValue(`${AGENT_VERSION} (agent)`));
    });
    act(() => {
      fireEvent.click(screen.getByText(`${LATEST_VERSION} (latest)`));
    });

    expect(await screen.findByText('Log Stats Frequency')).toBeInTheDocument();
  });

  test('Saves edited settings and preserves settings unknown to the schema', async () => {
    await setupAgent(AGENT_VERSION, [{ name: 'customThing', valueString: 'preserve-me' }]);
    renderAppRoutes(medplum, `/${getReferenceString(agent)}/config`);

    await screen.findByText('Keep Alive');
    act(() => {
      fireEvent.click(screen.getByRole('checkbox', { name: 'Keep Alive' }));
    });

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /save settings/i }));
    });

    expect(await screen.findByText('Success')).toBeInTheDocument();

    const updated = await medplum.readResource('Agent', agent.id as string);
    expect(updated.setting).toContainEqual({ name: 'keepAlive', valueBoolean: true });
    // A setting the selected schema does not know about must not be dropped on save.
    expect(updated.setting).toContainEqual({ name: 'customThing', valueString: 'preserve-me' });
  });

  test('Reload Config triggers the $reload-config operation', async () => {
    await setupAgent(AGENT_VERSION);
    medplum.router.router.add('GET', 'Agent/:id/$reload-config', async () => [
      allOk,
      { resourceType: 'Parameters', parameter: [] },
    ]);

    renderAppRoutes(medplum, `/${getReferenceString(agent)}/config`);

    await screen.findByText('Keep Alive');
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /reload config/i }));
    });

    // The success notification only fires when the $reload-config operation resolves.
    expect(await screen.findByText('Agent config reloaded successfully.')).toBeInTheDocument();
  });

  test('Shows a fallback when no schema version can be resolved', async () => {
    // Agent version is unknown and fetching the latest version fails -> no versions to validate against.
    globalThis.fetch = mockFetch(500, () => ({}));
    await setupAgent('unknown');
    renderAppRoutes(medplum, `/${getReferenceString(agent)}/config`);

    expect(await screen.findByText('Settings editor unavailable')).toBeInTheDocument();
    expect(screen.queryByText('Keep Alive')).not.toBeInTheDocument();
  });
});
