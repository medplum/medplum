// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { ConceptMap, ConceptMapGroupElementTarget } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import { MemoryRouter } from 'react-router';
import { act, fireEvent, render, screen, selectAutocompleteOption } from '../test-utils/render';
import type { ConceptMapBuilderProps } from './ConceptMapBuilder';
import { ConceptMapBuilder } from './ConceptMapBuilder';

const medplum = new MockClient();

const SNOMED = 'http://snomed.info/sct';
const ICD10 = 'http://hl7.org/fhir/sid/icd-10-cm';
const CPT = 'http://www.ama-assn.org/go/cpt';
// MockClient's $expand ignores the url and always returns the example ValueSet, so any
// non-empty binding drives the autocomplete. Set canonical scopes so source/target pickers bind.
const BINDING = 'https://example.com/test';

async function setup(args: ConceptMapBuilderProps): Promise<void> {
  await act(async () => {
    render(
      <MemoryRouter>
        <MedplumProvider medplum={medplum}>
          <ConceptMapBuilder {...args} />
        </MedplumProvider>
      </MemoryRouter>
    );
  });
}

function stripIds<T>(obj: T): T {
  if (Array.isArray(obj)) {
    return obj.map(stripIds) as unknown as T;
  }
  if (obj && typeof obj === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (k === 'id') {
        continue;
      }
      out[k] = stripIds(v);
    }
    return out as T;
  }
  return obj;
}

const twoGroupFixture: ConceptMap = {
  resourceType: 'ConceptMap',
  status: 'draft',
  group: [
    {
      source: SNOMED,
      target: ICD10,
      element: [
        {
          code: '73211009',
          display: 'Diabetes mellitus',
          target: [{ code: 'E11.9', display: 'Type 2 diabetes', equivalence: 'equivalent' }],
        },
        {
          code: '386661006',
          display: 'Fever',
          target: [{ code: 'R50.9', display: 'Fever, unspecified', equivalence: 'narrower' }],
        },
        {
          code: '49436004',
          display: 'Atrial fibrillation',
          target: [{ equivalence: 'unmatched' }],
        },
      ],
    },
    {
      source: SNOMED,
      target: CPT,
      element: [
        {
          code: '5880005',
          display: 'Physical exam',
          target: [{ code: '99213', display: 'Office visit', equivalence: 'wider' }],
        },
      ],
    },
  ],
};

describe('ConceptMapBuilder', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(async () => {
    await act(async () => {
      vi.runOnlyPendingTimers();
    });
    vi.useRealTimers();
  });

  test('Renders empty with an auto-created blank group', async () => {
    await setup({ value: { resourceType: 'ConceptMap', status: 'draft' }, onSubmit: vi.fn() });
    expect(screen.getByTestId('conceptmap-form')).toBeInTheDocument();
    expect(screen.getByText('SOURCE CODE')).toBeInTheDocument();
    expect(screen.getByText('Add mapping')).toBeInTheDocument();
  });

  test('Renders an existing map with all groups, rows, and equivalences', async () => {
    await setup({ value: twoGroupFixture, onSubmit: vi.fn() });
    expect(screen.getByText('Diabetes mellitus')).toBeInTheDocument();
    expect(screen.getByText('Fever')).toBeInTheDocument();
    expect(screen.getByText('Physical exam')).toBeInTheDocument();
    expect(screen.getByText('equivalent')).toBeInTheDocument();
    expect(screen.getByText('narrower')).toBeInTheDocument();
    // No-map row is visually distinct.
    expect(screen.getByText('— no equivalent')).toBeInTheDocument();
  });

  test('Coverage counter reflects mapped rows', async () => {
    await setup({ value: twoGroupFixture, onSubmit: vi.fn() });
    // First group: 3 rows, all have a target (incl. the unmatched no-map) => 3 of 3.
    const counters = screen.getAllByTestId('coverage-counter');
    expect(counters[0]).toHaveTextContent('Coverage: 3 of 3 source codes mapped');
  });

  test('Round-trip fidelity: load then save is a no-op modulo ids', async () => {
    const onSubmit = vi.fn();
    await setup({ value: twoGroupFixture, onSubmit });
    await act(async () => {
      fireEvent.click(screen.getByText('Save'));
    });
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(stripIds(onSubmit.mock.calls[0][0])).toEqual(twoGroupFixture);
  });

  test('Add mapping row appears and is included in the payload', async () => {
    const onSubmit = vi.fn();
    await setup({ value: { resourceType: 'ConceptMap', status: 'draft' }, onSubmit });
    await act(async () => {
      fireEvent.click(screen.getByText('Add mapping'));
    });
    await act(async () => {
      fireEvent.click(screen.getByText('Save'));
    });
    const submitted: ConceptMap = onSubmit.mock.calls[0][0];
    expect(submitted.group?.[0].element).toHaveLength(1);
  });

  test('Edit source code sets element.code and display', async () => {
    const onSubmit = vi.fn();
    await setup({
      value: { resourceType: 'ConceptMap', status: 'draft', sourceCanonical: BINDING, targetCanonical: BINDING },
      onSubmit,
    });
    await act(async () => {
      fireEvent.click(screen.getByText('Add mapping'));
    });
    const searchbox = screen.getByPlaceholderText('Search source code');
    await selectAutocompleteOption(searchbox, 'Test', 'Test Display');
    await act(async () => {
      fireEvent.click(screen.getByText('Save'));
    });
    const submitted: ConceptMap = onSubmit.mock.calls[0][0];
    expect(submitted.group?.[0].element?.[0].code).toBe('test-code');
    expect(submitted.group?.[0].element?.[0].display).toBe('Test Display');
  });

  test('Add and edit a target with a required equivalence', async () => {
    const onSubmit = vi.fn();
    await setup({
      value: { resourceType: 'ConceptMap', status: 'draft', sourceCanonical: BINDING, targetCanonical: BINDING },
      onSubmit,
    });
    await act(async () => {
      fireEvent.click(screen.getByText('Add mapping'));
    });
    await act(async () => {
      fireEvent.click(screen.getByText('add target'));
    });
    const target = screen.getByPlaceholderText('Search target code');
    await selectAutocompleteOption(target, 'Test', 'Test Display');
    // Pick equivalence by driving the Mantine Select: open it, then click the option.
    await act(async () => {
      fireEvent.click(screen.getByPlaceholderText('relationship *'));
    });
    const option = await screen.findByText('equivalent — same meaning');
    await act(async () => {
      fireEvent.click(option);
    });
    await act(async () => {
      fireEvent.click(screen.getByText('Save'));
    });
    const submitted: ConceptMap = onSubmit.mock.calls[0][0];
    const t = submitted.group?.[0].element?.[0].target?.[0];
    expect(t?.code).toBe('test-code');
    expect(t?.equivalence).toBe('equivalent');
  });

  test('Equivalence required: a coded target without a relationship blocks submit', async () => {
    const onSubmit = vi.fn();
    await setup({
      value: {
        resourceType: 'ConceptMap',
        status: 'draft',
        // Intentionally omits equivalence to exercise the required-relationship guard.
        group: [
          {
            source: SNOMED,
            target: ICD10,
            element: [{ code: 'a', target: [{ code: 'b' } as ConceptMapGroupElementTarget] }],
          },
        ],
      },
      onSubmit,
    });
    await act(async () => {
      fireEvent.click(screen.getByText('Save'));
    });
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByTestId('conceptmap-error')).toBeInTheDocument();
  });

  test('No-map toggle sets an unmatched target and clears it when untoggled', async () => {
    const onSubmit = vi.fn();
    await setup({
      value: {
        resourceType: 'ConceptMap',
        status: 'draft',
        group: [{ source: SNOMED, target: ICD10, element: [{ id: 'el', code: 'a' }] }],
      },
      onSubmit,
    });
    // Select the row to reveal its editor.
    await act(async () => {
      fireEvent.click(screen.getByTestId('el'));
    });
    const toggle = screen.getByLabelText('No equivalent');
    await act(async () => {
      fireEvent.click(toggle);
    });
    await act(async () => {
      fireEvent.click(screen.getByText('Save'));
    });
    const submitted: ConceptMap = onSubmit.mock.calls[0][0];
    expect(submitted.group?.[0].element?.[0].target).toEqual([expect.objectContaining({ equivalence: 'unmatched' })]);
    expect(submitted.group?.[0].element?.[0].target?.[0].code).toBeUndefined();
  });

  test('Multiple targets round-trip', async () => {
    const onSubmit = vi.fn();
    const fixture: ConceptMap = {
      resourceType: 'ConceptMap',
      status: 'draft',
      group: [
        {
          source: SNOMED,
          target: ICD10,
          element: [
            {
              code: 'a',
              target: [
                { code: 'x', equivalence: 'wider' },
                { code: 'y', equivalence: 'narrower' },
              ],
            },
          ],
        },
      ],
    };
    await setup({ value: fixture, onSubmit });
    await act(async () => {
      fireEvent.click(screen.getByText('Save'));
    });
    expect(stripIds(onSubmit.mock.calls[0][0])).toEqual(fixture);
  });

  test('Add and remove group', async () => {
    const onSubmit = vi.fn();
    await setup({ value: twoGroupFixture, onSubmit });
    await act(async () => {
      fireEvent.click(screen.getByText('Group'));
    });
    // Three groups now => remove buttons are present (collapsible mode).
    const removeButtons = screen.getAllByLabelText('Remove group');
    expect(removeButtons).toHaveLength(3);
    await act(async () => {
      fireEvent.click(removeButtons[2]);
    });
    await act(async () => {
      fireEvent.click(screen.getByText('Save'));
    });
    const submitted: ConceptMap = onSubmit.mock.calls[0][0];
    expect(submitted.group).toHaveLength(2);
  });

  test('Untouched auto-created group is pruned on save', async () => {
    const onSubmit = vi.fn();
    await setup({ value: { resourceType: 'ConceptMap', status: 'draft' }, onSubmit });
    await act(async () => {
      fireEvent.click(screen.getByText('Save'));
    });
    const submitted: ConceptMap = onSubmit.mock.calls[0][0];
    expect(submitted.group).toHaveLength(0);
  });

  test('Filter unmapped shows only unmapped rows', async () => {
    await setup({ value: twoGroupFixture, onSubmit: vi.fn() });
    // First group's filter select.
    const filters = screen.getAllByLabelText('Filter mappings');
    await act(async () => {
      fireEvent.change(filters[0], { target: { value: 'unmapped' } });
    });
    // All first-group rows are mapped, so none remain after the unmapped filter.
    expect(screen.queryByText('Diabetes mellitus')).not.toBeInTheDocument();
    expect(screen.queryByText('Fever')).not.toBeInTheDocument();
  });

  test('Render cap: >200 rows shows a banner and caps the rendered slice; save keeps all', async () => {
    const onSubmit = vi.fn();
    const bigFixture: ConceptMap = {
      resourceType: 'ConceptMap',
      status: 'draft',
      group: [
        {
          source: SNOMED,
          target: ICD10,
          element: Array.from({ length: 250 }, (_, i) => ({
            code: `code-${i}`,
            target: [{ code: `t-${i}`, equivalence: 'equivalent' as const }],
          })),
        },
      ],
    };
    await setup({ value: bigFixture, onSubmit });
    expect(screen.getByTestId('render-cap-banner')).toHaveTextContent('Showing 200 of 250 mappings');
    await act(async () => {
      fireEvent.click(screen.getByText('Save'));
    });
    const submitted: ConceptMap = onSubmit.mock.calls[0][0];
    expect(submitted.group?.[0].element).toHaveLength(250);
  });

  test('Read-only backstop: >10k elements renders read-only with a JSON-tab banner', async () => {
    const hugeFixture: ConceptMap = {
      resourceType: 'ConceptMap',
      status: 'draft',
      group: [
        {
          source: SNOMED,
          target: ICD10,
          element: Array.from({ length: 10_001 }, (_, i) => ({ code: `code-${i}` })),
        },
      ],
    };
    await setup({ value: hugeFixture, onSubmit: vi.fn() });
    expect(screen.getByText('Map too large to edit visually')).toBeInTheDocument();
    expect(screen.queryByText('Save')).not.toBeInTheDocument();
    expect(screen.queryByText('Add mapping')).not.toBeInTheDocument();
  });
});
