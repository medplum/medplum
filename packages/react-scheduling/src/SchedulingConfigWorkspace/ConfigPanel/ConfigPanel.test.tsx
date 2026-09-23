// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { describe, expect, test, vi } from 'vitest';
import { render, screen, userEvent } from '../../test-utils/render';
import type { ConfigPanelProps, ConfigPanelSection } from './ConfigPanel';
import { ConfigPanel } from './ConfigPanel';

function visitTypes(overrides?: Partial<ConfigPanelSection>): ConfigPanelSection {
  return {
    key: 'service',
    title: 'Visit types',
    noun: 'visit types',
    items: [
      { id: 'svc-1', label: 'Annual exam', selected: false },
      { id: 'svc-2', label: 'Blood draw', selected: true },
      { id: 'svc-3', label: 'Consult', selected: false, inactive: true },
    ],
    createLabel: 'New visit type',
    onCreate: vi.fn(),
    ...overrides,
  };
}

function setup(overrides?: Partial<ConfigPanelProps>): ConfigPanelProps {
  const props: ConfigPanelProps = {
    sections: [visitTypes()],
    onSelect: vi.fn(),
    filter: '',
    onFilterChange: vi.fn(),
    showInactive: false,
    onShowInactiveChange: vi.fn(),
    ...overrides,
  };
  render(<ConfigPanel {...props} />);
  return props;
}

function row(label: string): HTMLElement {
  return screen.getByText(label).closest('button') as HTMLElement;
}

describe('ConfigPanel', () => {
  test('heads each section with its count and a button to create one', async () => {
    const props = setup();

    expect(screen.getByText('Visit types')).toBeInTheDocument();
    expect(screen.getByTestId('section-count')).toHaveTextContent('3 listed');
    await userEvent.click(screen.getByRole('button', { name: 'New visit type' }));
    expect(props.sections[0].onCreate).toHaveBeenCalled();
  });

  test('a section without a create handler offers no button', () => {
    setup({ sections: [visitTypes({ onCreate: undefined, createLabel: undefined })] });

    expect(screen.queryByRole('button', { name: 'New visit type' })).not.toBeInTheDocument();
  });

  test('selecting a row reports its section and id', async () => {
    const props = setup();

    await userEvent.click(row('Annual exam'));

    expect(props.onSelect).toHaveBeenCalledWith('service', 'svc-1');
  });

  test('marks only the selected row current', () => {
    setup();

    expect(row('Blood draw')).toHaveAttribute('aria-current', 'true');
    expect(row('Annual exam')).not.toHaveAttribute('aria-current');
  });

  test('badges turned-off rows', () => {
    setup();

    expect(row('Consult')).toHaveTextContent('Inactive');
    expect(row('Blood draw')).not.toHaveTextContent('Inactive');
  });

  test('collapsing a section hides its rows and keeps its header and count', async () => {
    setup();

    await userEvent.click(screen.getByRole('button', { name: 'Hide visit types' }));

    expect(screen.getByText('Annual exam')).not.toBeVisible();
    expect(screen.getByText('Visit types')).toBeVisible();
    expect(screen.getByTestId('section-count')).toBeVisible();
  });

  test('reports what is typed into the filter', async () => {
    const props = setup();

    await userEvent.type(screen.getByLabelText('Filter'), 'a');

    expect(props.onFilterChange).toHaveBeenCalledWith('a');
  });

  test('offers Show inactive behind the filters button, not in the lists', async () => {
    const props = setup();

    expect(screen.queryByLabelText('Show inactive')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Filters' }));
    await userEvent.click(screen.getByLabelText('Show inactive'));

    expect(props.onShowInactiveChange).toHaveBeenCalledWith(true);
  });

  test('an empty section says nothing matched while filtering, and that there are none otherwise', () => {
    const { unmount } = render(
      <ConfigPanel
        sections={[visitTypes({ items: [] })]}
        onSelect={vi.fn()}
        filter=""
        onFilterChange={vi.fn()}
        showInactive={false}
        onShowInactiveChange={vi.fn()}
      />
    );
    expect(screen.getByText('No visit types yet')).toBeInTheDocument();
    unmount();

    setup({ sections: [visitTypes({ items: [] })], filter: 'zzz' });
    expect(screen.getByText('No matching visit types')).toBeInTheDocument();
  });

  test('says when a section stopped short', () => {
    setup({ sections: [visitTypes({ incomplete: true })] });

    expect(screen.getByText(/Not all visit types are listed/)).toBeInTheDocument();
  });

  test('shows loading in place of the empty message and the count', () => {
    setup({ sections: [visitTypes({ items: [], loading: true })] });

    expect(screen.getByLabelText('Loading visit types')).toBeInTheDocument();
    expect(screen.queryByText('No visit types yet')).not.toBeInTheDocument();
    expect(screen.queryByTestId('section-count')).not.toBeInTheDocument();
  });
});
