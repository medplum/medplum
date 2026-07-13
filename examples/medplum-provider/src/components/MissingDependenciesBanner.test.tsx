// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { OperationOutcomeError, notFound } from '@medplum/core';
import type { Bot, StructureDefinition, ValueSet } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { ICD10_CM_BILLABLE_VALUESET } from '../config/appDependencies';
import { MissingDependenciesBanner } from './MissingDependenciesBanner';

const US_CORE_PATIENT_URL = 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-patient';
const HEALTH_GORILLA_AUTOCOMPLETE_ID =
  'https://www.medplum.com/integrations/bot-identifier|health-gorilla-labs/autocomplete';

const presentValueSet: ValueSet = {
  resourceType: 'ValueSet',
  status: 'active',
  expansion: { timestamp: '2024-01-01T00:00:00.000Z', contains: [{ system: 'test', code: 'x' }] },
};

describe('MissingDependenciesBanner', () => {
  let medplum: MockClient;

  // Wire up every probe to succeed by default; individual tests override to simulate absence.
  function mockAllPresent(client: MockClient): void {
    vi.spyOn(client, 'valueSetExpand').mockResolvedValue(presentValueSet);
    vi.spyOn(client, 'searchOne').mockImplementation((async (resourceType: string) => {
      if (resourceType === 'StructureDefinition') {
        return { resourceType: 'StructureDefinition', url: US_CORE_PATIENT_URL } as StructureDefinition;
      }
      if (resourceType === 'Bot') {
        return { resourceType: 'Bot', id: 'hg-bot' } as Bot;
      }
      return undefined;
    }) as any);
  }

  beforeEach(() => {
    sessionStorage.clear();
    vi.clearAllMocks();
    medplum = new MockClient();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    sessionStorage.clear();
  });

  function setup(): ReturnType<typeof render> {
    return render(
      <MedplumProvider medplum={medplum}>
        <MantineProvider>
          <MissingDependenciesBanner />
        </MantineProvider>
      </MedplumProvider>
    );
  }

  test('Renders nothing when all dependencies are present', async () => {
    mockAllPresent(medplum);
    setup();

    await waitFor(() => {
      expect(medplum.valueSetExpand).toHaveBeenCalled();
    });
    expect(screen.queryByText(/shared projects are not linked/i)).not.toBeInTheDocument();
  });

  test('Flags UMLS terminology when its ValueSets 404', async () => {
    mockAllPresent(medplum);
    // The UMLS project is entirely unlinked, so every UMLS-backed $expand 404s.
    vi.spyOn(medplum, 'valueSetExpand').mockRejectedValue(new OperationOutcomeError(notFound));

    setup();

    await waitFor(() => {
      expect(screen.getByText('UMLS terminology')).toBeInTheDocument();
    });
    expect(screen.getByText(/shared projects are not linked/i)).toBeInTheDocument();
  });

  test('Does not flag UMLS when at least one of its ValueSets is present', async () => {
    mockAllPresent(medplum);
    // ICD-10 expands fine but the second UMLS ValueSet 404s. One present probe proves the UMLS
    // project is linked, so the group must NOT be flagged even though a sibling probe is missing.
    vi.spyOn(medplum, 'valueSetExpand').mockImplementation((async (params: { url: string }) => {
      if (params.url === ICD10_CM_BILLABLE_VALUESET) {
        return presentValueSet;
      }
      throw new OperationOutcomeError(notFound);
    }) as any);

    setup();

    await waitFor(() => {
      expect(medplum.valueSetExpand).toHaveBeenCalled();
    });
    expect(screen.queryByText('UMLS terminology')).not.toBeInTheDocument();
    expect(screen.queryByText(/shared projects are not linked/i)).not.toBeInTheDocument();
  });

  test('Flags US Core profiles when the profile search is empty', async () => {
    mockAllPresent(medplum);
    vi.spyOn(medplum, 'searchOne').mockImplementation((async (resourceType: string) => {
      if (resourceType === 'StructureDefinition') {
        return undefined;
      }
      if (resourceType === 'Bot') {
        return { resourceType: 'Bot', id: 'hg-bot' } as Bot;
      }
      return undefined;
    }) as any);

    setup();

    await waitFor(() => {
      expect(screen.getByText('US Core profiles')).toBeInTheDocument();
    });
  });

  test('Flags Health Gorilla when the bot search is empty', async () => {
    mockAllPresent(medplum);
    vi.spyOn(medplum, 'searchOne').mockImplementation((async (resourceType: string, query: unknown) => {
      if (
        resourceType === 'Bot' &&
        String((query as Record<string, string>).identifier) === HEALTH_GORILLA_AUTOCOMPLETE_ID
      ) {
        return undefined;
      }
      if (resourceType === 'StructureDefinition') {
        return { resourceType: 'StructureDefinition', url: US_CORE_PATIENT_URL } as StructureDefinition;
      }
      return undefined;
    }) as any);

    setup();

    await waitFor(() => {
      expect(screen.getByText('Health Gorilla integration')).toBeInTheDocument();
    });
  });

  test('Does not flag on transient (network) errors', async () => {
    vi.spyOn(medplum, 'valueSetExpand').mockRejectedValue(new Error('network down'));
    vi.spyOn(medplum, 'searchOne').mockRejectedValue(new Error('network down'));

    setup();

    await waitFor(() => {
      expect(medplum.valueSetExpand).toHaveBeenCalled();
    });
    // A plain thrown Error is inconclusive, so nothing is flagged.
    expect(screen.queryByText(/shared projects are not linked/i)).not.toBeInTheDocument();
  });

  test('Can be dismissed and stays dismissed for the session', async () => {
    const user = userEvent.setup();
    mockAllPresent(medplum);
    vi.spyOn(medplum, 'valueSetExpand').mockRejectedValue(new OperationOutcomeError(notFound));

    const { unmount } = setup();

    await waitFor(() => {
      expect(screen.getByText(/shared projects are not linked/i)).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /dismiss/i }));
    expect(screen.queryByText(/shared projects are not linked/i)).not.toBeInTheDocument();

    // Re-mount in the same session: dismissal persists.
    unmount();
    setup();
    await waitFor(() => {
      expect(medplum.searchOne).toHaveBeenCalled();
    });
    expect(screen.queryByText(/shared projects are not linked/i)).not.toBeInTheDocument();
  });
});
