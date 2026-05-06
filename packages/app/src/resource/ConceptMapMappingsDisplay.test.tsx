// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import type { ConceptMap } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { act } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { render, screen } from '../test-utils/render';
import { ConceptMapMappingsDisplay } from './ConceptMapMappingsDisplay';

const medplum = new MockClient();

function setup(conceptMap: ConceptMap): void {
  render(
    <MedplumProvider medplum={medplum}>
      <MemoryRouter>
        <MantineProvider>
          <ConceptMapMappingsDisplay conceptMap={conceptMap} />
        </MantineProvider>
      </MemoryRouter>
    </MedplumProvider>
  );
}

describe('ConceptMapMappingsDisplay', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(async () => {
    await act(async () => {
      jest.runOnlyPendingTimers();
    });
    jest.useRealTimers();
  });

  test('Shows empty state when no groups defined', () => {
    const conceptMap: ConceptMap = {
      resourceType: 'ConceptMap',
      status: 'active',
    };

    setup(conceptMap);

    expect(screen.getByText('No mappings defined in this ConceptMap.')).toBeInTheDocument();
  });

  test('Shows empty state when groups array is empty', () => {
    const conceptMap: ConceptMap = {
      resourceType: 'ConceptMap',
      status: 'active',
      group: [],
    };

    setup(conceptMap);

    expect(screen.getByText('No mappings defined in this ConceptMap.')).toBeInTheDocument();
  });

  test('Renders group header with source and target system URIs', () => {
    const conceptMap: ConceptMap = {
      resourceType: 'ConceptMap',
      status: 'active',
      group: [
        {
          source: 'http://snomed.info/sct',
          target: 'http://hl7.org/fhir/sid/icd-10',
          element: [],
        },
      ],
    };

    setup(conceptMap);

    expect(screen.getByText('Group 1')).toBeInTheDocument();
    expect(screen.getByText('http://snomed.info/sct')).toBeInTheDocument();
    expect(screen.getByText('http://hl7.org/fhir/sid/icd-10')).toBeInTheDocument();
  });

  test('Renders group header with version numbers', () => {
    const conceptMap: ConceptMap = {
      resourceType: 'ConceptMap',
      status: 'active',
      group: [
        {
          source: 'http://snomed.info/sct',
          sourceVersion: '2023-09-01',
          target: 'http://hl7.org/fhir/sid/icd-10',
          targetVersion: '2023',
          element: [],
        },
      ],
    };

    setup(conceptMap);

    expect(screen.getByText('http://snomed.info/sct (v2023-09-01)')).toBeInTheDocument();
    expect(screen.getByText('http://hl7.org/fhir/sid/icd-10 (v2023)')).toBeInTheDocument();
  });

  test('Renders (unspecified source) and (unspecified target) when not set', () => {
    const conceptMap: ConceptMap = {
      resourceType: 'ConceptMap',
      status: 'active',
      group: [
        {
          element: [],
        },
      ],
    };

    setup(conceptMap);

    expect(screen.getByText('(unspecified source)')).toBeInTheDocument();
    expect(screen.getByText('(unspecified target)')).toBeInTheDocument();
  });

  test('Renders table column headers', () => {
    const conceptMap: ConceptMap = {
      resourceType: 'ConceptMap',
      status: 'active',
      group: [
        {
          source: 'http://example.com/source',
          target: 'http://example.com/target',
          element: [{ code: 'a', target: [{ code: 'b', equivalence: 'equivalent' }] }],
        },
      ],
    };

    setup(conceptMap);

    expect(screen.getByText('Source Code')).toBeInTheDocument();
    expect(screen.getByText('Source Display')).toBeInTheDocument();
    expect(screen.getByText('Equivalence')).toBeInTheDocument();
    expect(screen.getByText('Target Code')).toBeInTheDocument();
    expect(screen.getByText('Target Display')).toBeInTheDocument();
    expect(screen.getByText('Comment')).toBeInTheDocument();
  });

  test('Renders a simple 1:1 mapping row', () => {
    const conceptMap: ConceptMap = {
      resourceType: 'ConceptMap',
      status: 'active',
      group: [
        {
          source: 'http://snomed.info/sct',
          target: 'http://hl7.org/fhir/sid/icd-10',
          element: [
            {
              code: '271737000',
              display: 'Anemia',
              target: [
                {
                  code: 'D64.9',
                  display: 'Anemia, unspecified',
                  equivalence: 'equivalent',
                  comment: 'Broad match',
                },
              ],
            },
          ],
        },
      ],
    };

    setup(conceptMap);

    expect(screen.getByText('271737000')).toBeInTheDocument();
    expect(screen.getByText('Anemia')).toBeInTheDocument();
    expect(screen.getByText('equivalent')).toBeInTheDocument();
    expect(screen.getByText('D64.9')).toBeInTheDocument();
    expect(screen.getByText('Anemia, unspecified')).toBeInTheDocument();
    expect(screen.getByText('Broad match')).toBeInTheDocument();
  });

  test('Renders element with no targets showing dashes', () => {
    const conceptMap: ConceptMap = {
      resourceType: 'ConceptMap',
      status: 'active',
      group: [
        {
          source: 'http://example.com/source',
          target: 'http://example.com/target',
          element: [
            {
              code: 'unmapped-code',
              display: 'Unmapped concept',
              // No target
            },
          ],
        },
      ],
    };

    setup(conceptMap);

    expect(screen.getByText('unmapped-code')).toBeInTheDocument();
    expect(screen.getByText('Unmapped concept')).toBeInTheDocument();
    // Should show dashes for all target columns
    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBeGreaterThanOrEqual(3); // targetCode, targetDisplay, equivalence
  });

  test('Renders element with empty target array showing dashes', () => {
    const conceptMap: ConceptMap = {
      resourceType: 'ConceptMap',
      status: 'active',
      group: [
        {
          source: 'http://example.com/source',
          target: 'http://example.com/target',
          element: [
            {
              code: 'no-target-code',
              target: [],
            },
          ],
        },
      ],
    };

    setup(conceptMap);

    expect(screen.getByText('no-target-code')).toBeInTheDocument();
    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBeGreaterThanOrEqual(3);
  });

  test('Renders 1:many mapping (multiple targets per source element)', () => {
    const conceptMap: ConceptMap = {
      resourceType: 'ConceptMap',
      status: 'active',
      group: [
        {
          source: 'http://example.com/source',
          target: 'http://example.com/target',
          element: [
            {
              code: 'source-1',
              display: 'Source One',
              target: [
                { code: 'target-a', display: 'Target A', equivalence: 'equivalent' },
                { code: 'target-b', display: 'Target B', equivalence: 'inexact' },
              ],
            },
          ],
        },
      ],
    };

    setup(conceptMap);

    // Source code/display appear once (rowSpan)
    expect(screen.getByText('source-1')).toBeInTheDocument();
    expect(screen.getByText('Source One')).toBeInTheDocument();

    // Both targets appear
    expect(screen.getByText('target-a')).toBeInTheDocument();
    expect(screen.getByText('Target A')).toBeInTheDocument();
    expect(screen.getByText('equivalent')).toBeInTheDocument();

    expect(screen.getByText('target-b')).toBeInTheDocument();
    expect(screen.getByText('Target B')).toBeInTheDocument();
    expect(screen.getByText('inexact')).toBeInTheDocument();
  });

  test('Renders multiple groups with separate section headers', () => {
    const conceptMap: ConceptMap = {
      resourceType: 'ConceptMap',
      status: 'active',
      group: [
        {
          source: 'http://snomed.info/sct',
          target: 'http://hl7.org/fhir/sid/icd-10',
          element: [{ code: 'snomed-1', target: [{ code: 'icd-1', equivalence: 'equivalent' }] }],
        },
        {
          source: 'http://loinc.org',
          target: 'http://hl7.org/fhir/sid/icd-10',
          element: [{ code: 'loinc-1', target: [{ code: 'icd-2', equivalence: 'wider' }] }],
        },
      ],
    };

    setup(conceptMap);

    expect(screen.getByText('Group 1')).toBeInTheDocument();
    expect(screen.getByText('Group 2')).toBeInTheDocument();
    expect(screen.getByText('http://snomed.info/sct')).toBeInTheDocument();
    expect(screen.getByText('http://loinc.org')).toBeInTheDocument();
    expect(screen.getByText('snomed-1')).toBeInTheDocument();
    expect(screen.getByText('loinc-1')).toBeInTheDocument();
  });

  test('Renders unmapped note when group.unmapped is set with mode=fixed', () => {
    const conceptMap: ConceptMap = {
      resourceType: 'ConceptMap',
      status: 'active',
      group: [
        {
          source: 'http://example.com/source',
          target: 'http://example.com/target',
          element: [{ code: 'a', target: [{ code: 'b', equivalence: 'equivalent' }] }],
          unmapped: {
            mode: 'fixed',
            code: 'D64.9',
            display: 'Anemia, unspecified',
          },
        },
      ],
    };

    setup(conceptMap);

    expect(screen.getByText('Unmapped:')).toBeInTheDocument();
    expect(screen.getByText(/mode=fixed/)).toBeInTheDocument();
    expect(screen.getByText(/code=D64\.9/)).toBeInTheDocument();
    expect(screen.getByText(/Anemia, unspecified/)).toBeInTheDocument();
  });

  test('Renders unmapped note with mode=other-map and url', () => {
    const conceptMap: ConceptMap = {
      resourceType: 'ConceptMap',
      status: 'active',
      group: [
        {
          source: 'http://example.com/source',
          target: 'http://example.com/target',
          element: [{ code: 'a', target: [{ code: 'b', equivalence: 'equivalent' }] }],
          unmapped: {
            mode: 'other-map',
            url: 'http://example.com/fallback-map',
          },
        },
      ],
    };

    setup(conceptMap);

    expect(screen.getByText(/mode=other-map/)).toBeInTheDocument();
    expect(screen.getByText(/fallback map=http:\/\/example\.com\/fallback-map/)).toBeInTheDocument();
  });

  test('Renders unmapped note with mode=provided (no extra fields)', () => {
    const conceptMap: ConceptMap = {
      resourceType: 'ConceptMap',
      status: 'active',
      group: [
        {
          source: 'http://example.com/source',
          target: 'http://example.com/target',
          element: [{ code: 'a', target: [{ code: 'b', equivalence: 'equivalent' }] }],
          unmapped: {
            mode: 'provided',
          },
        },
      ],
    };

    setup(conceptMap);

    expect(screen.getByText(/mode=provided/)).toBeInTheDocument();
  });

  test('Does not render unmapped note when group.unmapped is not set', () => {
    const conceptMap: ConceptMap = {
      resourceType: 'ConceptMap',
      status: 'active',
      group: [
        {
          source: 'http://example.com/source',
          target: 'http://example.com/target',
          element: [{ code: 'a', target: [{ code: 'b', equivalence: 'equivalent' }] }],
        },
      ],
    };

    setup(conceptMap);

    expect(screen.queryByText('Unmapped:')).not.toBeInTheDocument();
  });

  test('Handles element with missing code and display (shows dashes)', () => {
    const conceptMap: ConceptMap = {
      resourceType: 'ConceptMap',
      status: 'active',
      group: [
        {
          source: 'http://example.com/source',
          target: 'http://example.com/target',
          element: [
            {
              // no code, no display
              target: [{ code: 'target-x', equivalence: 'relatedto' }],
            },
          ],
        },
      ],
    };

    setup(conceptMap);

    expect(screen.getByText('target-x')).toBeInTheDocument();
    expect(screen.getByText('relatedto')).toBeInTheDocument();
  });

  test('Handles target with missing code and display (shows dashes)', () => {
    const conceptMap: ConceptMap = {
      resourceType: 'ConceptMap',
      status: 'active',
      group: [
        {
          source: 'http://example.com/source',
          target: 'http://example.com/target',
          element: [
            {
              code: 'source-x',
              target: [
                {
                  // no code, no display, no comment
                  equivalence: 'disjoint',
                },
              ],
            },
          ],
        },
      ],
    };

    setup(conceptMap);

    expect(screen.getByText('source-x')).toBeInTheDocument();
    expect(screen.getByText('disjoint')).toBeInTheDocument();
    // Target code and display should show dashes
    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBeGreaterThanOrEqual(2);
  });

  test('Renders all equivalence values correctly', () => {
    const equivalences = [
      'relatedto',
      'equivalent',
      'equal',
      'wider',
      'subsumes',
      'narrower',
      'specializes',
      'inexact',
      'unmatched',
      'disjoint',
    ] as const;

    const conceptMap: ConceptMap = {
      resourceType: 'ConceptMap',
      status: 'active',
      group: [
        {
          source: 'http://example.com/source',
          target: 'http://example.com/target',
          element: equivalences.map((eq, i) => ({
            code: `src-${i}`,
            target: [{ code: `tgt-${i}`, equivalence: eq }],
          })),
        },
      ],
    };

    setup(conceptMap);

    for (const eq of equivalences) {
      expect(screen.getByText(eq)).toBeInTheDocument();
    }
  });

  test('Renders multiple elements with multiple targets', () => {
    const conceptMap: ConceptMap = {
      resourceType: 'ConceptMap',
      status: 'active',
      group: [
        {
          source: 'http://example.com/source',
          target: 'http://example.com/target',
          element: [
            {
              code: 'elem-1',
              display: 'Element 1',
              target: [
                { code: 'tgt-1a', equivalence: 'equivalent' },
                { code: 'tgt-1b', equivalence: 'narrower' },
              ],
            },
            {
              code: 'elem-2',
              display: 'Element 2',
              target: [{ code: 'tgt-2', equivalence: 'wider' }],
            },
          ],
        },
      ],
    };

    setup(conceptMap);

    expect(screen.getByText('elem-1')).toBeInTheDocument();
    expect(screen.getByText('tgt-1a')).toBeInTheDocument();
    expect(screen.getByText('tgt-1b')).toBeInTheDocument();
    expect(screen.getByText('elem-2')).toBeInTheDocument();
    expect(screen.getByText('tgt-2')).toBeInTheDocument();
  });
});
