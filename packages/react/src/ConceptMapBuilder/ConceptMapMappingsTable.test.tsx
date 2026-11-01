// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { ConceptMap } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import { MemoryRouter } from 'react-router';
import { act, fireEvent, render, screen } from '../test-utils/render';
import { ConceptMapMappingsTable } from './ConceptMapMappingsTable';

const medplum = new MockClient();

const SNOMED = 'http://snomed.info/sct';
const ICD10 = 'http://hl7.org/fhir/sid/icd-10-cm';
const CPT = 'http://www.ama-assn.org/go/cpt';

async function setup(value: ConceptMap): Promise<void> {
  await act(async () => {
    render(
      <MemoryRouter>
        <MedplumProvider medplum={medplum}>
          <ConceptMapMappingsTable value={value} />
        </MedplumProvider>
      </MemoryRouter>
    );
  });
}

const fixture: ConceptMap = {
  resourceType: 'ConceptMap',
  status: 'draft',
  group: [
    {
      source: SNOMED,
      sourceVersion: '2024-03',
      target: ICD10,
      element: [
        {
          code: '73211009',
          display: 'Diabetes mellitus',
          target: [
            { code: 'E11.9', display: 'Type 2 diabetes', equivalence: 'equivalent' },
            { code: 'E10.9', display: 'Type 1 diabetes', equivalence: 'narrower', comment: 'Only when documented' },
          ],
        },
        { code: '49436004', display: 'Atrial fibrillation', target: [{ equivalence: 'unmatched' }] },
        { code: '271737000', display: 'Anemia' },
      ],
    },
    {
      source: SNOMED,
      target: CPT,
      element: [{ code: '5880005', display: 'Physical exam', target: [{ code: '99213', equivalence: 'wider' }] }],
    },
  ],
};

describe('ConceptMapMappingsTable', () => {
  test('Renders one table section per group with system URLs and versions', async () => {
    await setup(fixture);
    expect(screen.getByText('Group 1')).toBeInTheDocument();
    expect(screen.getByText('Group 2')).toBeInTheDocument();
    expect(screen.getByText(`${SNOMED} (v2024-03)`)).toBeInTheDocument();
    expect(screen.getByText(ICD10)).toBeInTheDocument();
    expect(screen.getByText(CPT)).toBeInTheDocument();
  });

  test('Each group section is a named region with a heading', async () => {
    await setup(fixture);
    const groups = screen.getAllByRole('group');
    expect(groups).toHaveLength(2);
    expect(groups[0]).toHaveAttribute('aria-label', `Group 1: ${SNOMED} to ${ICD10}`);
    expect(groups[1]).toHaveAttribute('aria-label', `Group 2: ${SNOMED} to ${CPT}`);
    expect(screen.getByRole('heading', { name: 'Group 1' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Group 2' })).toBeInTheDocument();
  });

  test('Renders all six columns and the comment content', async () => {
    await setup(fixture);
    expect(screen.getAllByText('Source code')).toHaveLength(2);
    expect(screen.getAllByText('Source display')).toHaveLength(2);
    expect(screen.getAllByText('Target code')).toHaveLength(2);
    expect(screen.getAllByText('Target display')).toHaveLength(2);
    expect(screen.getAllByText('Comment')).toHaveLength(2);
    expect(screen.getByText('Only when documented')).toBeInTheDocument();
  });

  test('A source mapped to two targets spans its rows once', async () => {
    await setup(fixture);
    // Diabetes has two targets, so the source cell appears once with rowSpan=2.
    const sourceCells = screen.getAllByText('73211009');
    expect(sourceCells).toHaveLength(1);
    expect(sourceCells[0].closest('td')).toHaveAttribute('rowspan', '2');
    expect(screen.getByText('Type 2 diabetes')).toBeInTheDocument();
    expect(screen.getByText('Type 1 diabetes')).toBeInTheDocument();
  });

  test('An element with no targets still gets a row', async () => {
    await setup(fixture);
    expect(screen.getByText('Anemia')).toBeInTheDocument();
    expect(screen.getByText('271737000')).toBeInTheDocument();
  });

  test('Search narrows rows and reports the count', async () => {
    await setup(fixture);
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Search mappings'), { target: { value: 'anemia' } });
    });
    expect(screen.getByText('Anemia')).toBeInTheDocument();
    expect(screen.queryByText('Diabetes mellitus')).not.toBeInTheDocument();
    expect(screen.getAllByTestId('table-group-count')[0]).toHaveTextContent('1 shown');
    // The second group has no match, so it shows its own empty state.
    expect(screen.getAllByTestId('table-no-matches').length).toBeGreaterThan(0);
  });

  test('Search matches a comment', async () => {
    await setup(fixture);
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Search mappings'), { target: { value: 'when documented' } });
    });
    expect(screen.getByText('Diabetes mellitus')).toBeInTheDocument();
    expect(screen.queryByText('Anemia')).not.toBeInTheDocument();
  });

  test('Filter excludes no-map rows from Mapped', async () => {
    await setup(fixture);
    await act(async () => {
      fireEvent.change(screen.getAllByLabelText('Filter mappings')[0], { target: { value: 'mapped' } });
    });
    expect(screen.getByText('Diabetes mellitus')).toBeInTheDocument();
    expect(screen.queryByText('Atrial fibrillation')).not.toBeInTheDocument();
  });

  test('Caps rendered rows above the table limit and says so', async () => {
    const big: ConceptMap = {
      resourceType: 'ConceptMap',
      status: 'draft',
      group: [
        {
          source: SNOMED,
          target: ICD10,
          element: Array.from({ length: 1200 }, (_, i) => ({
            code: `code-${i}`,
            target: [{ code: `t-${i}`, equivalence: 'equivalent' as const }],
          })),
        },
      ],
    };
    await setup(big);
    expect(screen.getByTestId('table-render-cap-banner')).toHaveTextContent('Showing 1,000 of 1,200 source codes');
    expect(screen.getByText('code-999')).toBeInTheDocument();
    expect(screen.queryByText('code-1000')).not.toBeInTheDocument();
    // Search reaches past the cap.
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Search mappings'), { target: { value: 'code-1100' } });
    });
    expect(screen.getByText('code-1100')).toBeInTheDocument();
  });

  test('Surfaces the group unmapped fallback rule', async () => {
    await setup({
      resourceType: 'ConceptMap',
      status: 'draft',
      group: [
        {
          source: SNOMED,
          target: ICD10,
          element: [{ code: 'a', target: [{ code: 'x', equivalence: 'equivalent' }] }],
          unmapped: { mode: 'other-map', url: 'http://example.org/ConceptMap/fallback' },
        },
      ],
    });
    expect(screen.getByTestId('table-unmapped-rule')).toHaveTextContent('mode=other-map');
    expect(screen.getByTestId('table-unmapped-rule')).toHaveTextContent(
      'fallback map=http://example.org/ConceptMap/fallback'
    );
  });

  test('Empty map renders an empty state', async () => {
    await setup({ resourceType: 'ConceptMap', status: 'draft' });
    expect(screen.getByText('No mappings defined in this ConceptMap.')).toBeInTheDocument();
  });

  test('Group with no elements renders its own empty state', async () => {
    await setup({
      resourceType: 'ConceptMap',
      status: 'draft',
      group: [{ source: SNOMED, target: ICD10, element: [] }],
    });
    expect(screen.getByText('This group has no mappings.')).toBeInTheDocument();
  });

  test('Unspecified systems are labelled rather than blank', async () => {
    await setup({
      resourceType: 'ConceptMap',
      status: 'draft',
      group: [{ element: [{ code: 'a' }] }],
    });
    expect(screen.getByText('(unspecified source)')).toBeInTheDocument();
    expect(screen.getByText('(unspecified target)')).toBeInTheDocument();
  });
});
