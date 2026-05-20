// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Text } from '@mantine/core';
import { MedplumClient } from '@medplum/core';
import { MedplumProvider } from '@medplum/react-hooks';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router';
import { render, screen } from '../test-utils/render';
import { ListDetailLayout } from './ListDetailLayout';
import { ListEmptyState } from './ListEmptyState';
import { ListItem } from './ListItem';
import { ListPagination } from './ListPagination';
import { ListScrollArea } from './ListScrollArea';
import { ListShell } from './ListShell';
import { ListSkeleton } from './ListSkeleton';

function mockFetch(url: string, options: any): Promise<any> {
  const response: any = { request: { url, options } };
  return Promise.resolve({
    blob: () => Promise.resolve(response),
    json: () => Promise.resolve(response),
  });
}

const medplum = new MedplumClient({
  baseUrl: 'https://example.com/',
  clientId: 'my-client-id',
  fetch: mockFetch,
});

function setup(ui: ReactElement): ReturnType<typeof render> {
  return render(
    <MemoryRouter>
      <MedplumProvider medplum={medplum} navigate={jest.fn()}>
        {ui}
      </MedplumProvider>
    </MemoryRouter>
  );
}

describe('ListItem', () => {
  test('Renders children with link when `to` is provided', () => {
    setup(
      <ListItem to="/Patient/123">
        <span>Patient row</span>
      </ListItem>
    );
    expect(screen.getByText('Patient row')).toBeDefined();
    const anchor = screen.getByRole('link');
    expect(anchor.getAttribute('href')).toBe('/Patient/123');
  });

  test('Renders as button when only `onClick` is provided', () => {
    const handleClick = jest.fn();
    setup(
      <ListItem onClick={handleClick}>
        <span>Clickable</span>
      </ListItem>
    );
    const button = screen.getByRole('button');
    expect(button).toBeDefined();
    button.click();
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  test('Applies selected class when selected', () => {
    const { container } = setup(
      <ListItem to="/Patient/123" selected>
        <span>Selected</span>
      </ListItem>
    );
    const item = container.querySelector('[class*="item"]');
    expect(item).toBeDefined();
    expect(item?.className).toContain('selected');
  });

  test('Does not apply selected class when not selected', () => {
    const { container } = setup(
      <ListItem to="/Patient/123" selected={false}>
        <span>Not selected</span>
      </ListItem>
    );
    const item = container.querySelector('[class*="item"]');
    expect(item).toBeDefined();
    expect(item?.className).not.toContain('selected');
  });
});

describe('ListShell', () => {
  test('Renders children', () => {
    setup(
      <ListShell>
        <div>Body content</div>
      </ListShell>
    );
    expect(screen.getByText('Body content')).toBeDefined();
  });

  test('Renders header', () => {
    setup(
      <ListShell header={<Text>Header Text</Text>}>
        <div>Body</div>
      </ListShell>
    );
    expect(screen.getByText('Header Text')).toBeDefined();
  });

  test('Renders footer', () => {
    setup(
      <ListShell footer={<div data-testid="paginator">paginate</div>}>
        <div>Body</div>
      </ListShell>
    );
    expect(screen.getByTestId('paginator')).toBeDefined();
  });
});

describe('ListScrollArea', () => {
  test('Renders children inside scroll area', () => {
    setup(
      <ListScrollArea>
        <div>Scroll content</div>
      </ListScrollArea>
    );
    expect(screen.getByText('Scroll content')).toBeDefined();
  });
});

describe('ListEmptyState', () => {
  test('Renders message text', () => {
    setup(<ListEmptyState message="No items available." />);
    expect(screen.getByText('No items available.')).toBeDefined();
  });

  test('Renders description when provided', () => {
    setup(<ListEmptyState message="No task selected" description="Select a task to view details" />);
    expect(screen.getByText('No task selected')).toBeDefined();
    expect(screen.getByText('Select a task to view details')).toBeDefined();
  });

  test('Renders icon inside a ThemeIcon when provided', () => {
    const { container } = setup(
      <ListEmptyState
        message="Empty"
        icon={<svg data-testid="empty-icon" />}
      />
    );
    expect(screen.getByTestId('empty-icon')).toBeDefined();
    expect(container.querySelector('[class*="mantine-ThemeIcon"]')).not.toBeNull();
  });
});

describe('ListSkeleton', () => {
  test('Renders default skeleton rows', () => {
    const { container } = setup(<ListSkeleton />);
    const skeletons = container.querySelectorAll('[class*="mantine-Skeleton"]');
    // 6 rows * 3 lines = 18 skeletons
    expect(skeletons.length).toBe(18);
  });

  test('Renders custom number of rows', () => {
    const { container } = setup(<ListSkeleton rows={3} linesPerRow={2} />);
    const skeletons = container.querySelectorAll('[class*="mantine-Skeleton"]');
    // 3 rows * 2 lines = 6 skeletons
    expect(skeletons.length).toBe(6);
  });

  test('Renders an avatar placeholder per row when `withAvatar` is set', () => {
    const { container } = setup(<ListSkeleton rows={3} linesPerRow={2} withAvatar />);
    const skeletons = container.querySelectorAll('[class*="mantine-Skeleton"]');
    // 3 rows * (1 avatar + 2 lines) = 9 skeletons
    expect(skeletons.length).toBe(9);
  });
});

describe('ListPagination', () => {
  test('Renders nothing when total is undefined', () => {
    setup(<ListPagination total={undefined} offset={0} pageSize={20} onOffsetChange={jest.fn()} />);
    expect(document.querySelector('.mantine-Pagination-root')).toBeNull();
  });

  test('Renders nothing when total fits within a single page', () => {
    setup(<ListPagination total={10} offset={0} pageSize={20} onOffsetChange={jest.fn()} />);
    expect(document.querySelector('.mantine-Pagination-root')).toBeNull();
  });

  test('Renders Mantine Pagination when total exceeds page size', () => {
    setup(<ListPagination total={50} offset={20} pageSize={20} onOffsetChange={jest.fn()} />);
    expect(document.querySelector('.mantine-Pagination-root')).not.toBeNull();
  });

  test('Calls onOffsetChange with the right offset when page changes', () => {
    const onOffsetChange = jest.fn();
    setup(<ListPagination total={100} offset={0} pageSize={20} onOffsetChange={onOffsetChange} />);
    const pageButtons = document.querySelectorAll('.mantine-Pagination-control');
    // The "page 3" button should compute offset = (3 - 1) * 20 = 40 when clicked.
    const page3 = Array.from(pageButtons).find((b) => b.textContent === '3') as HTMLElement | undefined;
    page3?.click();
    expect(onOffsetChange).toHaveBeenCalledWith(40);
  });
});

describe('ListDetailLayout', () => {
  test('Renders children in a flex row', () => {
    setup(
      <ListDetailLayout>
        <div>Left column</div>
        <div>Right column</div>
      </ListDetailLayout>
    );
    expect(screen.getByText('Left column')).toBeDefined();
    expect(screen.getByText('Right column')).toBeDefined();
  });

  test('Column renders bordered className when bordered is true', () => {
    const { container } = setup(
      <ListDetailLayout>
        <ListDetailLayout.Column bordered>
          <div>Bordered</div>
        </ListDetailLayout.Column>
      </ListDetailLayout>
    );
    const column = container.querySelector('[class*="detailBorder"]');
    expect(column).toBeDefined();
  });
});
