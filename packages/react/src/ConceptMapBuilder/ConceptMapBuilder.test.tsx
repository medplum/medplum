// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { CodeSystem, ConceptMap, ConceptMapGroupElementTarget } from '@medplum/fhirtypes';
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
          // FHIR invariant cmd-1 requires a comment on narrower/inexact targets.
          target: [
            { code: 'R50.9', display: 'Fever, unspecified', equivalence: 'narrower', comment: 'Excludes drug fever' },
          ],
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
                { code: 'y', equivalence: 'narrower', comment: 'Subset of x' },
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

  test('Search matches source code, display, and target fields', async () => {
    await setup({ value: twoGroupFixture, onSubmit: vi.fn() });
    const searches = screen.getAllByLabelText('Search mappings');

    // Match on source display.
    await act(async () => {
      fireEvent.change(searches[0], { target: { value: 'fever' } });
    });
    expect(screen.getByText('Fever')).toBeInTheDocument();
    expect(screen.queryByText('Diabetes mellitus')).not.toBeInTheDocument();

    // Match on target code.
    await act(async () => {
      fireEvent.change(searches[0], { target: { value: 'E11.9' } });
    });
    expect(screen.getByText('Diabetes mellitus')).toBeInTheDocument();
    expect(screen.queryByText('Fever')).not.toBeInTheDocument();

    // Match on comment.
    await act(async () => {
      fireEvent.change(searches[0], { target: { value: 'drug fever' } });
    });
    expect(screen.getByText('Fever')).toBeInTheDocument();
    expect(screen.queryByText('Diabetes mellitus')).not.toBeInTheDocument();
  });

  test('Search reports the narrowed count and an empty state', async () => {
    await setup({ value: twoGroupFixture, onSubmit: vi.fn() });
    const searches = screen.getAllByLabelText('Search mappings');
    await act(async () => {
      fireEvent.change(searches[0], { target: { value: 'fever' } });
    });
    expect(screen.getAllByTestId('coverage-counter')[0]).toHaveTextContent('1 shown');

    await act(async () => {
      fireEvent.change(searches[0], { target: { value: 'nothing matches this' } });
    });
    expect(screen.getAllByTestId('no-matches')[0]).toBeInTheDocument();
  });

  test('Mapped filter excludes no-map and unmapped rows', async () => {
    await setup({ value: twoGroupFixture, onSubmit: vi.fn() });
    const filters = screen.getAllByLabelText('Filter mappings');
    await act(async () => {
      fireEvent.change(filters[0], { target: { value: 'mapped' } });
    });
    expect(screen.getByText('Diabetes mellitus')).toBeInTheDocument();
    // Atrial fibrillation is a no-map row, so it is excluded from "Mapped".
    expect(screen.queryByText('Atrial fibrillation')).not.toBeInTheDocument();
  });

  test('Add mapping past the render cap still shows the new row', async () => {
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
    await setup({ value: bigFixture, onSubmit: vi.fn() });
    expect(document.querySelectorAll('[class*="editing"]')).toHaveLength(0);
    await act(async () => {
      fireEvent.click(screen.getByText('Add mapping'));
    });
    expect(screen.getByTestId('coverage-counter')).toHaveTextContent('Coverage: 250 of 251');
    // The appended row is auto-selected, so it must be rendered even though it is past the cap.
    expect(document.querySelectorAll('[class*="editing"]')).toHaveLength(1);
  });

  test('No-map toggle is blocked while coded targets exist', async () => {
    await setup({
      value: {
        resourceType: 'ConceptMap',
        status: 'draft',
        group: [
          {
            source: SNOMED,
            target: ICD10,
            element: [{ id: 'el', code: 'a', target: [{ code: 'x', equivalence: 'equivalent' }] }],
          },
        ],
      },
      onSubmit: vi.fn(),
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('el'));
    });
    expect(screen.getByLabelText('No equivalent')).toBeDisabled();
    expect(screen.getByText('Remove the targets below first')).toBeInTheDocument();
  });

  test('Comment is required for narrower and inexact mappings', async () => {
    const onSubmit = vi.fn();
    await setup({
      value: {
        resourceType: 'ConceptMap',
        status: 'draft',
        group: [
          {
            source: SNOMED,
            target: ICD10,
            element: [{ id: 'el', code: 'a', target: [{ id: 't', code: 'x', equivalence: 'narrower' }] }],
          },
        ],
      },
      onSubmit,
    });
    await act(async () => {
      fireEvent.click(screen.getByText('Save'));
    });
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByTestId('conceptmap-error')).toHaveTextContent('require a comment');

    // Supplying the comment unblocks the save.
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Comment'), { target: { value: 'Narrower: excludes subtype' } });
    });
    await act(async () => {
      fireEvent.click(screen.getByText('Save'));
    });
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  test('Warns before an edit replaces possibly-$import-ed mappings', async () => {
    const imported = await medplum.createResource<ConceptMap>({
      resourceType: 'ConceptMap',
      status: 'active',
    });
    await setup({ value: { reference: `ConceptMap/${imported.id}` }, onSubmit: vi.fn() });
    // Arriving at an empty map is not itself risky, so no warning yet — otherwise every newly
    // created ConceptMap would show it.
    expect(screen.queryByTestId('imported-mappings-warning')).not.toBeInTheDocument();

    // Adding a mapping is the point at which saving would replace imported rows.
    await act(async () => {
      fireEvent.click(screen.getByText('Add mapping'));
    });
    expect(screen.getByTestId('imported-mappings-warning')).toBeInTheDocument();
  });

  test('Enter in a text field is cancelled so it cannot implicitly submit the form', async () => {
    const onSubmit = vi.fn();
    await setup({ value: twoGroupFixture, onSubmit });

    // jsdom does not implement implicit form submission, so asserting "onSubmit was not called"
    // would pass even without the guard. Assert the mechanism instead: a cancelled keydown is what
    // stops a real browser from clicking the form's default submit button.
    function enterIsCancelled(element: Element): boolean {
      const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
      element.dispatchEvent(event);
      return event.defaultPrevented;
    }

    const search = screen.getAllByLabelText('Search mappings')[0];
    await act(async () => {
      fireEvent.change(search, { target: { value: 'fever' } });
    });
    expect(enterIsCancelled(search)).toBe(true);
    expect(onSubmit).not.toHaveBeenCalled();

    // Save still works from an explicit click.
    await act(async () => {
      fireEvent.click(screen.getByText('Save'));
    });
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  test('Hand-typing a URL does not fire a lookup per keystroke or swap the field', async () => {
    const spy = vi.spyOn(medplum, 'searchOne');
    await setup({ value: { resourceType: 'ConceptMap', status: 'draft' }, onSubmit: vi.fn() });
    await act(async () => {
      fireEvent.click(screen.getAllByText('Enter URL manually')[0]);
    });
    spy.mockClear();
    const field = screen.getByLabelText('Source system');
    const url = 'http://example.org/CodeSystem/typed';
    for (let i = 1; i <= url.length; i++) {
      await act(async () => {
        fireEvent.change(field, { target: { value: url.slice(0, i) } });
      });
    }
    expect(spy.mock.calls.filter((c) => c[0] === 'CodeSystem')).toHaveLength(0);
    // The URL field stays put rather than being replaced by the picker mid-edit.
    expect(screen.getByPlaceholderText('https://example.org/CodeSystem/…')).toBeInTheDocument();
    spy.mockRestore();
  });

  test('No import warning for a map that has inline groups', async () => {
    await setup({ value: twoGroupFixture, onSubmit: vi.fn() });
    expect(screen.queryByTestId('imported-mappings-warning')).not.toBeInTheDocument();
  });

  test('Group unmapped fallback rule is surfaced', async () => {
    await setup({
      value: {
        resourceType: 'ConceptMap',
        status: 'draft',
        group: [
          {
            source: SNOMED,
            target: ICD10,
            element: [{ code: 'a', target: [{ code: 'x', equivalence: 'equivalent' }] }],
            unmapped: { mode: 'fixed', code: 'UNKNOWN', display: 'Unknown' },
          },
        ],
      },
      onSubmit: vi.fn(),
    });
    expect(screen.getByTestId('unmapped-rule')).toHaveTextContent('mode=fixed');
    expect(screen.getByTestId('unmapped-rule')).toHaveTextContent('code=UNKNOWN');
  });

  test('A stored system with no CodeSystem resource shows its URL in the field', async () => {
    await setup({
      value: {
        resourceType: 'ConceptMap',
        status: 'draft',
        group: [{ source: SNOMED, sourceVersion: '2024-03', target: ICD10, element: [] }],
      },
      onSubmit: vi.fn(),
    });
    // No CodeSystem resource matches these URLs, so the URL field takes over and shows the
    // stored value rather than leaving an empty-looking picker.
    expect(screen.getByLabelText('Source system')).toHaveValue(SNOMED);
    expect(screen.getByLabelText('Target system')).toHaveValue(ICD10);
    expect(screen.getByText('v2024-03')).toBeInTheDocument();
  });

  test('A stored system that resolves prefills the CodeSystem picker', async () => {
    const url = 'http://example.org/CodeSystem/resolvable';
    await medplum.createResource<CodeSystem>({
      resourceType: 'CodeSystem',
      status: 'active',
      content: 'complete',
      url,
      name: 'ResolvableSystem',
      title: 'Resolvable System',
      valueSet: 'http://example.org/ValueSet/resolvable',
    });
    await setup({
      value: {
        resourceType: 'ConceptMap',
        status: 'draft',
        group: [{ source: url, target: ICD10, element: [] }],
      },
      onSubmit: vi.fn(),
    });
    // The resolved CodeSystem becomes the picker's value (shown as a pill, clearable to change
    // it), with the canonical URL kept below as secondary detail.
    expect(screen.getByText(/Resolvable/)).toBeInTheDocument();
    expect(screen.getByText(url)).toBeInTheDocument();
  });

  test('A coded target cannot also be unmatched', async () => {
    const onSubmit = vi.fn();
    await setup({
      value: {
        resourceType: 'ConceptMap',
        status: 'draft',
        group: [
          {
            source: SNOMED,
            target: ICD10,
            // Contradictory: unmatched means "no equivalent exists", but a code is present.
            element: [{ id: 'el', code: 'a', target: [{ id: 't', code: 'x', equivalence: 'unmatched' }] }],
          },
        ],
      },
      onSubmit,
    });
    await act(async () => {
      fireEvent.click(screen.getByText('Save'));
    });
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByTestId('conceptmap-error')).toHaveTextContent('cannot be "unmatched" and have a code');
  });

  test('Generated keys never collide with ids already in the resource', async () => {
    // An existing `id-N` that appears after an element with no id used to be handed the same key,
    // which React reports as two children with the same key.
    const warn = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await setup({
      value: {
        resourceType: 'ConceptMap',
        status: 'draft',
        group: [
          {
            id: 'g',
            source: SNOMED,
            target: ICD10,
            element: [{ code: 'first' }, { id: 'id-1', code: 'second' }, { code: 'third' }],
          },
        ],
      },
      onSubmit: vi.fn(),
    });
    const duplicateKeyWarning = warn.mock.calls.some((c) => String(c[0]).includes('same key'));
    expect(duplicateKeyWarning).toBe(false);
    warn.mockRestore();

    // All three rows render, each with a distinct test id.
    const ids = ['first', 'second', 'third'].map((code) => screen.getByText(code).closest('[data-testid]'));
    const testIds = ids.map((el) => el?.getAttribute('data-testid'));
    expect(new Set(testIds).size).toBe(3);
  });

  test('Remove button is not nested inside the row button', async () => {
    await setup({
      value: {
        resourceType: 'ConceptMap',
        status: 'draft',
        group: [
          {
            source: SNOMED,
            target: ICD10,
            element: [{ id: 'el', code: 'a', display: 'Alpha', target: [{ code: 'x', equivalence: 'equivalent' }] }],
          },
        ],
      },
      onSubmit: vi.fn(),
    });
    const remove = screen.getByLabelText('Remove mapping');
    const rowButton = screen.getByLabelText('Edit mapping a');

    // `role="button"` has presentational children in ARIA, so anything inside the activatable
    // region is hidden from screen readers. The remove button must be a sibling, not a descendant.
    expect(rowButton).toHaveAttribute('role', 'button');
    expect(rowButton.contains(remove)).toBe(false);
    expect(rowButton.querySelectorAll('button')).toHaveLength(0);

    // Clicking the row still expands it, and the remove button still works.
    await act(async () => {
      fireEvent.click(rowButton);
    });
    expect(screen.getByLabelText('No equivalent')).toBeInTheDocument();
  });

  test('Row stays keyboard-operable after the restructure', async () => {
    await setup({
      value: {
        resourceType: 'ConceptMap',
        status: 'draft',
        group: [{ source: SNOMED, target: ICD10, element: [{ id: 'el', code: 'a' }] }],
      },
      onSubmit: vi.fn(),
    });
    const rowButton = screen.getByLabelText('Edit mapping a');
    expect(rowButton).toHaveAttribute('tabIndex', '0');
    await act(async () => {
      fireEvent.keyDown(rowButton, { key: 'Enter', code: 'Enter' });
    });
    // Expanding reveals the row editor.
    expect(screen.getByLabelText('No equivalent')).toBeInTheDocument();
  });

  test('Each group is a named region so its repeated controls are distinguishable', async () => {
    await setup({
      value: {
        resourceType: 'ConceptMap',
        status: 'draft',
        group: [
          { source: SNOMED, target: ICD10, element: [{ code: 'a' }] },
          { source: SNOMED, target: CPT, element: [{ code: 'b' }] },
        ],
      },
      onSubmit: vi.fn(),
    });
    // The control names are duplicated by design; the group name is what disambiguates them.
    expect(screen.getAllByLabelText('Search mappings')).toHaveLength(2);
    const groups = screen.getAllByRole('group');
    expect(groups).toHaveLength(2);
    expect(groups[0]).toHaveAttribute('aria-label', `Group 1: ${SNOMED} to ${ICD10}`);
    expect(groups[1]).toHaveAttribute('aria-label', `Group 2: ${SNOMED} to ${CPT}`);
  });

  test('A group with no systems yet still gets a name', async () => {
    await setup({ value: { resourceType: 'ConceptMap', status: 'draft' }, onSubmit: vi.fn() });
    expect(screen.getByRole('group')).toHaveAttribute('aria-label', 'Group 1');
  });

  test('Read-only backstop: >10k elements renders the read-only mappings table', async () => {
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
    // The read-only path renders the mappings table instead of the editable grid.
    expect(screen.getByText('Group 1')).toBeInTheDocument();
    expect(screen.getByText('Source display')).toBeInTheDocument();
  });
});
