// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Bundle, Communication, Resource } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { act, fireEvent, render, screen, waitFor } from '../test-utils/render';
import type { ResourceBoardProps } from './ResourceBoard';
import { ResourceBoard } from './ResourceBoard';

function comm(id: string, topic: string): Communication {
  return {
    resourceType: 'Communication',
    id,
    status: 'in-progress',
    topic: { text: topic },
  };
}

function bundleOf(...comms: Communication[]): Bundle<Communication> {
  return {
    resourceType: 'Bundle',
    type: 'searchset',
    total: comms.length,
    entry: comms.map((resource) => ({ resource })),
  };
}

const mockNavigate = vi.fn();

describe('ResourceBoard', () => {
  let medplum: MockClient;

  beforeEach(() => {
    medplum = new MockClient();
    vi.clearAllMocks();
    medplum.search = vi.fn().mockResolvedValue(bundleOf());
  });

  async function setup(props: Partial<ResourceBoardProps>): Promise<void> {
    const defaultRenderItem = (item: Resource, ctx: { selected: boolean }): ReactNode => (
      <div data-testid={`item-${item.id}`} data-selected={ctx.selected}>
        {(item as Communication).topic?.text}
      </div>
    );
    const defaultRenderDetail = (item: Resource): ReactNode => (
      <div data-testid="detail">{(item as Communication).topic?.text} detail</div>
    );
    await act(async () => {
      render(
        <ResourceBoard
          search={{ resourceType: 'Communication' }}
          renderItem={defaultRenderItem}
          renderDetail={defaultRenderDetail}
          {...props}
        />,
        ({ children }) => (
          <MemoryRouter>
            <MedplumProvider medplum={medplum} navigate={mockNavigate}>
              {children}
            </MedplumProvider>
          </MemoryRouter>
        )
      );
      await Promise.resolve();
    });
  }

  test('shows skeleton while loading', async () => {
    medplum.search = vi.fn().mockImplementation(() => new Promise(() => {}));
    await setup({});
    expect(document.querySelectorAll('.mantine-Skeleton-root').length).toBeGreaterThan(0);
  });

  test('shows custom skeleton while loading', async () => {
    medplum.search = vi.fn().mockImplementation(() => new Promise(() => {}));
    await setup({ skeleton: <div data-testid="custom-skeleton" /> });
    expect(screen.getByTestId('custom-skeleton')).toBeInTheDocument();
    expect(document.querySelectorAll('.mantine-Skeleton-root')).toHaveLength(0);
  });

  test('renders items and highlights the selected one', async () => {
    medplum.search = vi.fn().mockResolvedValue(bundleOf(comm('a', 'Alpha'), comm('b', 'Beta')));
    await setup({ selectedId: 'a' });
    await waitFor(() => expect(screen.getByTestId('item-a')).toBeInTheDocument());
    expect(screen.getByTestId('item-a')).toHaveAttribute('data-selected', 'true');
    expect(screen.getByTestId('item-b')).toHaveAttribute('data-selected', 'false');
    await waitFor(() => expect(screen.getByTestId('detail')).toHaveTextContent('Alpha detail'));
  });

  test('shows default empty list state', async () => {
    await setup({});
    await waitFor(() => expect(screen.getByText('No items found')).toBeInTheDocument());
  });

  test('shows custom empty list state', async () => {
    await setup({ emptyList: <div data-testid="custom-empty-list" /> });
    await waitFor(() => expect(screen.getByTestId('custom-empty-list')).toBeInTheDocument());
  });

  test('shows default empty detail state when nothing selected', async () => {
    medplum.search = vi.fn().mockResolvedValue(bundleOf(comm('a', 'Alpha')));
    await setup({});
    await waitFor(() =>
      expect(screen.getByText('Select an item from the list to view details')).toBeInTheDocument()
    );
  });

  test('shows custom empty detail state', async () => {
    await setup({ emptyDetail: <div data-testid="custom-empty-detail" /> });
    await waitFor(() => expect(screen.getByTestId('custom-empty-detail')).toBeInTheDocument());
  });

  test('resolves unlisted selection via readResource', async () => {
    medplum.search = vi.fn().mockResolvedValue(bundleOf(comm('a', 'Alpha')));
    medplum.readResource = vi.fn().mockResolvedValue(comm('z', 'Zeta'));
    await setup({ selectedId: 'z' });
    await waitFor(() => expect(screen.getByTestId('detail')).toHaveTextContent('Zeta detail'));
    expect(medplum.readResource).toHaveBeenCalledWith('Communication', 'z');
  });

  test('selection resolution error shows empty detail and calls onError', async () => {
    const onError = vi.fn();
    medplum.search = vi.fn().mockResolvedValue(bundleOf(comm('a', 'Alpha')));
    medplum.readResource = vi.fn().mockRejectedValue(new Error('not found'));
    await setup({ selectedId: 'z', onError });
    await waitFor(() => expect(onError).toHaveBeenCalled());
    expect(screen.getByText('Select an item from the list to view details')).toBeInTheDocument();
    expect(screen.queryByTestId('detail')).not.toBeInTheDocument();
  });

  test('list load error calls onError', async () => {
    const onError = vi.fn();
    medplum.search = vi.fn().mockRejectedValue(new Error('boom'));
    await setup({ onError });
    await waitFor(() => expect(onError).toHaveBeenCalled());
  });

  test('hides pagination when onChange is omitted', async () => {
    medplum.search = vi.fn().mockResolvedValue({ ...bundleOf(comm('a', 'Alpha')), total: 50 });
    await setup({ search: { resourceType: 'Communication', count: 20 } });
    await waitFor(() => expect(screen.getByTestId('item-a')).toBeInTheDocument());
    expect(screen.queryByText('2')).not.toBeInTheDocument();
  });

  test('hides pagination when total fits one page', async () => {
    medplum.search = vi.fn().mockResolvedValue({ ...bundleOf(comm('a', 'Alpha')), total: 5 });
    await setup({ search: { resourceType: 'Communication', count: 20 }, onChange: vi.fn() });
    await waitFor(() => expect(screen.getByTestId('item-a')).toBeInTheDocument());
    expect(screen.queryByText('2')).not.toBeInTheDocument();
  });

  test('pagination emits onChange with new offset', async () => {
    const onChange = vi.fn();
    medplum.search = vi.fn().mockResolvedValue({ ...bundleOf(comm('a', 'Alpha')), total: 50 });
    await setup({ search: { resourceType: 'Communication', count: 20 }, onChange });
    await waitFor(() => expect(screen.getByText('2')).toBeInTheDocument());
    await act(async () => {
      fireEvent.click(screen.getByText('2'));
    });
    expect(onChange).toHaveBeenCalledWith({ resourceType: 'Communication', count: 20, offset: 20 });
  });

  test('tab click navigates to the tab URI', async () => {
    await setup({
      tabs: [
        { value: 'inbox', label: 'Inbox', uri: '/inbox' },
        { value: 'sent', label: 'Sent', uri: '/sent' },
      ],
      activeTab: 'inbox',
    });
    await act(async () => {
      fireEvent.click(screen.getByText('Sent'));
    });
    expect(mockNavigate).toHaveBeenCalledWith('/sent');
  });

  test('tabs render as anchors with hrefs for browser link affordances', async () => {
    await setup({
      tabs: [
        { value: 'inbox', label: 'Inbox', uri: '/inbox' },
        { value: 'sent', label: 'Sent', uri: '/sent' },
      ],
      activeTab: 'inbox',
    });
    expect(screen.getByText('Inbox').closest('a')).toHaveAttribute('href', '/inbox');
    expect(screen.getByText('Sent').closest('a')).toHaveAttribute('href', '/sent');
    expect(screen.getByText('Inbox').closest('button')).toHaveAttribute('data-active');
    expect(screen.getByText('Sent').closest('button')).not.toHaveAttribute('data-active');
  });

  test('aux tab click is left to the browser', async () => {
    await setup({
      tabs: [
        { value: 'inbox', label: 'Inbox', uri: '/inbox' },
        { value: 'sent', label: 'Sent', uri: '/sent' },
      ],
      activeTab: 'inbox',
    });
    await act(async () => {
      fireEvent.click(screen.getByText('Sent'), { ctrlKey: true });
    });
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  test('renders header actions', async () => {
    await setup({ headerActions: <button data-testid="header-action">New</button> });
    expect(screen.getByTestId('header-action')).toBeInTheDocument();
  });

  test('onSelectFirst fires with the first item when nothing is selected', async () => {
    const onSelectFirst = vi.fn();
    medplum.search = vi.fn().mockResolvedValue(bundleOf(comm('a', 'Alpha'), comm('b', 'Beta')));
    await setup({ onSelectFirst });
    await waitFor(() => expect(onSelectFirst).toHaveBeenCalledTimes(1));
    expect(onSelectFirst).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }));
  });

  test('onSelectFirst does not fire when an item is selected', async () => {
    const onSelectFirst = vi.fn();
    medplum.search = vi.fn().mockResolvedValue(bundleOf(comm('a', 'Alpha')));
    await setup({ selectedId: 'a', onSelectFirst });
    await waitFor(() => expect(screen.getByTestId('item-a')).toBeInTheDocument());
    expect(onSelectFirst).not.toHaveBeenCalled();
  });

  test('custom loadItems replaces the default search', async () => {
    const loadItems = vi.fn().mockResolvedValue({ items: [comm('x', 'Xylo')], total: 1 });
    await setup({ loadItems });
    await waitFor(() => expect(screen.getByTestId('item-x')).toBeInTheDocument());
    expect(loadItems).toHaveBeenCalled();
    expect(medplum.search).not.toHaveBeenCalled();
  });

  test('custom resolveSelected replaces the default resolution', async () => {
    const resolveSelected = vi.fn().mockResolvedValue(comm('virtual', 'Virtual'));
    medplum.search = vi.fn().mockResolvedValue(bundleOf(comm('a', 'Alpha')));
    medplum.readResource = vi.fn();
    await setup({ selectedId: 'a', resolveSelected });
    await waitFor(() => expect(screen.getByTestId('detail')).toHaveTextContent('Virtual detail'));
    expect(medplum.readResource).not.toHaveBeenCalled();
  });

  test('detail refresh callback refetches without showing the skeleton', async () => {
    medplum.search = vi.fn().mockResolvedValue(bundleOf(comm('a', 'Alpha')));
    let refresh: (() => Promise<void>) | undefined;
    await setup({
      selectedId: 'a',
      renderDetail: (item, ctx) => {
        refresh = ctx.refresh;
        return <div data-testid="detail">{(item as Communication).topic?.text} detail</div>;
      },
    });
    await waitFor(() => expect(screen.getByTestId('detail')).toBeInTheDocument());
    expect(medplum.search).toHaveBeenCalledTimes(1);

    let resolveSearch: (bundle: Bundle<Communication>) => void = () => {};
    medplum.search = vi.fn().mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSearch = resolve;
        })
    );

    let refreshPromise: Promise<void> | undefined;
    act(() => {
      refreshPromise = refresh?.();
    });
    // While the refresh is pending, the old list stays visible and no skeleton appears
    expect(screen.getByTestId('item-a')).toBeInTheDocument();
    expect(document.querySelectorAll('.mantine-Skeleton-root')).toHaveLength(0);

    await act(async () => {
      resolveSearch(bundleOf(comm('a', 'Alpha'), comm('b', 'Beta')));
      await refreshPromise;
    });
    expect(screen.getByTestId('item-b')).toBeInTheDocument();
  });

  test('onLoad fires with items and total', async () => {
    const onLoad = vi.fn();
    medplum.search = vi.fn().mockResolvedValue({ ...bundleOf(comm('a', 'Alpha')), total: 42 });
    await setup({ onLoad });
    await waitFor(() => expect(onLoad).toHaveBeenCalled());
    expect(onLoad).toHaveBeenCalledWith([expect.objectContaining({ id: 'a' })], 42);
  });

  test('refetches when the search changes by value, not identity', async () => {
    medplum.search = vi.fn().mockResolvedValue(bundleOf(comm('a', 'Alpha')));
    const props: ResourceBoardProps = {
      search: { resourceType: 'Communication' },
      renderItem: (item) => <div data-testid={`item-${item.id}`} />,
      renderDetail: () => <div />,
    };
    const { rerender } = render(
      <MemoryRouter>
        <MedplumProvider medplum={medplum} navigate={mockNavigate}>
          <ResourceBoard {...props} />
        </MedplumProvider>
      </MemoryRouter>
    );
    await waitFor(() => expect(screen.getByTestId('item-a')).toBeInTheDocument());
    expect(medplum.search).toHaveBeenCalledTimes(1);

    // Same value, new identity: no refetch
    await act(async () => {
      rerender(
        <MemoryRouter>
          <MedplumProvider medplum={medplum} navigate={mockNavigate}>
            <ResourceBoard {...props} search={{ resourceType: 'Communication' }} />
          </MedplumProvider>
        </MemoryRouter>
      );
    });
    expect(medplum.search).toHaveBeenCalledTimes(1);

    // Different value: refetch
    await act(async () => {
      rerender(
        <MemoryRouter>
          <MedplumProvider medplum={medplum} navigate={mockNavigate}>
            <ResourceBoard {...props} search={{ resourceType: 'Communication', offset: 20 }} />
          </MedplumProvider>
        </MemoryRouter>
      );
    });
    await waitFor(() => expect(medplum.search).toHaveBeenCalledTimes(2));
  });
});
