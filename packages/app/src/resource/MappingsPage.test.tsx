// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { ConceptMap } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { act, renderAppRoutes, screen } from '../test-utils/render';

describe('MappingsPage', () => {
  async function setup(url: string, medplum = new MockClient()): Promise<void> {
    await act(async () => {
      renderAppRoutes(medplum, url);
    });
  }

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(async () => {
    await act(async () => {
      jest.runOnlyPendingTimers();
    });
    jest.useRealTimers();
  });

  test('ConceptMap Mappings tab appears in tab bar', async () => {
    const medplum = new MockClient();
    const conceptMap = await medplum.createResource<ConceptMap>({
      resourceType: 'ConceptMap',
      status: 'active',
      name: 'TestMap',
    });

    await setup(`/ConceptMap/${conceptMap.id}`, medplum);

    expect(await screen.findByText('Mappings')).toBeInTheDocument();
  });

  test('Renders ConceptMapMappingsDisplay when navigating to /mappings', async () => {
    const medplum = new MockClient();
    const conceptMap = await medplum.createResource<ConceptMap>({
      resourceType: 'ConceptMap',
      status: 'active',
      name: 'TestMap',
      group: [
        {
          source: 'http://snomed.info/sct',
          target: 'http://hl7.org/fhir/sid/icd-10',
          element: [
            {
              code: '271737000',
              display: 'Anemia',
              target: [{ code: 'D64.9', display: 'Anemia, unspecified', equivalence: 'equivalent' }],
            },
          ],
        },
      ],
    });

    await setup(`/ConceptMap/${conceptMap.id}/mappings`, medplum);

    expect(await screen.findByText('Group 1')).toBeInTheDocument();
    expect(screen.getByText('http://snomed.info/sct')).toBeInTheDocument();
    expect(screen.getByText('http://hl7.org/fhir/sid/icd-10')).toBeInTheDocument();
    expect(screen.getByText('271737000')).toBeInTheDocument();
    expect(screen.getByText('Anemia')).toBeInTheDocument();
    expect(screen.getByText('equivalent')).toBeInTheDocument();
    expect(screen.getByText('D64.9')).toBeInTheDocument();
    expect(screen.getByText('Anemia, unspecified')).toBeInTheDocument();
  });

  test('Shows empty state for ConceptMap with no groups', async () => {
    const medplum = new MockClient();
    const conceptMap = await medplum.createResource<ConceptMap>({
      resourceType: 'ConceptMap',
      status: 'active',
    });

    await setup(`/ConceptMap/${conceptMap.id}/mappings`, medplum);

    expect(await screen.findByText('No mappings defined in this ConceptMap.')).toBeInTheDocument();
  });

  test('Returns null for non-ConceptMap resource type', async () => {
    // Navigate to mappings for a Practitioner (unsupported type)
    // MappingsPage should render nothing (null)
    const medplum = new MockClient();
    await setup('/Practitioner/123/mappings', medplum);

    // The page renders but shows nothing from MappingsPage
    // The tab bar / ResourcePage header should still render
    expect(await screen.findByText('Details')).toBeInTheDocument();
    expect(screen.queryByText('Group 1')).not.toBeInTheDocument();
    expect(screen.queryByText('No mappings defined in this ConceptMap.')).not.toBeInTheDocument();
  });
});
