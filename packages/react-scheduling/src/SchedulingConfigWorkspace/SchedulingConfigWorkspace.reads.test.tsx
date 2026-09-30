// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MockClient } from '@medplum/mock';
import { describe, expect, test, vi } from 'vitest';
import * as configSearch from '../configSearch';
import { ConfigFixtures } from '../stories/scheduling';
import { renderWithMedplum, screen, within } from '../test-utils/render';
import { SchedulingConfigWorkspace } from './SchedulingConfigWorkspace';

// Stubbed at the module, since reaching a read limit for real means rendering thousands of rows.
vi.mock('../configSearch', async (importOriginal) => {
  const actual = await importOriginal<typeof configSearch>();
  return { ...actual, searchConfigurableActors: vi.fn(actual.searchConfigurableActors) };
});

describe('SchedulingConfigWorkspace reads', () => {
  test('says a section stopped short of everything, and names a section that failed while listing the rest', async () => {
    const medplum = new MockClient({ seedDefaultData: false });
    for (const resource of ConfigFixtures) {
      await medplum.createResource(resource);
    }
    const actual = await vi.importActual<typeof configSearch>('../configSearch');
    vi.mocked(configSearch.searchConfigurableActors).mockImplementation(async (client, resourceType, options) => {
      if (resourceType === 'Device') {
        throw new Error('Access denied');
      }
      const result = await actual.searchConfigurableActors(client, resourceType, options);
      return resourceType === 'Practitioner' ? { ...result, complete: false } : result;
    });

    renderWithMedplum(<SchedulingConfigWorkspace />, medplum);

    const sidebar = screen.getByRole('navigation', { name: 'Scheduling configuration' });
    expect(await screen.findByText('Devices could not be loaded: Access denied')).toBeInTheDocument();
    expect(
      await within(sidebar).findByText('Not all providers are listed: there were more than could be loaded.')
    ).toBeInTheDocument();
    expect(within(sidebar).getByText('Telehealth Consult')).toBeInTheDocument();
    expect(within(sidebar).getByText('Dr. Maya Rivera')).toBeInTheDocument();
    expect(within(sidebar).getByText('Exam Room A')).toBeInTheDocument();
  });
});
