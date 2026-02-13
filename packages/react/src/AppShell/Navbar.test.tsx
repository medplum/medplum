// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { AppShell as MantineAppShell } from '@mantine/core';
import type { Communication } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import { IconMail, IconStar } from '@tabler/icons-react';
import 'jest-websocket-mock';
import { act, fireEvent, render, screen } from '../test-utils/render';
import type { NavbarMenu } from './Navbar';
import { Navbar } from './Navbar';

const medplum = new MockClient();
const navigateMock = jest.fn();
const toggleMock = jest.fn();
const closeMock = jest.fn();

async function setup(initial = '/'): Promise<void> {
  const initialUrl = new URL(initial, 'http://localhost');
  medplum.getUserConfiguration = jest.fn(() => {
    return {
      resourceType: 'UserConfiguration',
      id: 'test-user-config-id',
      menu: [
        {
          title: 'Favorites',
          link: [
            { name: 'Patients', target: '/Patient' },
            { name: 'Active Orders', target: '/ServiceRequest?status=active' },
            { name: 'Completed Orders', target: '/ServiceRequest?status=completed' },
          ],
        },
        {
          title: 'Admin',
          link: [
            { name: 'Project', target: '/admin/project' },
            { name: 'Batch', target: '/batch' },
          ],
        },
      ],
    };
  });
  await act(async () => {
    render(
      <MedplumProvider medplum={medplum} navigate={navigateMock}>
        <MantineAppShell>
          <Navbar
            logo={<div>Logo</div>}
            pathname={initialUrl.pathname}
            searchParams={initialUrl.searchParams}
            navbarToggle={toggleMock}
            closeNavbar={closeMock}
            menus={[
              {
                title: 'Menu 1',
                links: [
                  { label: 'Link 1', href: '/link1' },
                  { label: 'Link 2', href: '/link2' },
                  { label: 'Link 3', href: '/link3' },
                ],
              },
              {
                title: 'Menu 2',
                links: [
                  { label: 'Link 4', href: '/link?key=4&_offset=0' },
                  { label: 'Link 5', href: '/link?key=5' },
                  { label: 'Link 6', href: '/link?key=6', icon: <IconStar /> },
                ],
              },
            ]}
            displayAddBookmark={true}
          />
        </MantineAppShell>
      </MedplumProvider>
    );
  });
}

describe('Navbar', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    navigateMock.mockClear();
    closeMock.mockClear();
  });

  afterEach(async () => {
    await act(async () => {
      jest.runOnlyPendingTimers();
    });
    jest.useRealTimers();
  });

  test('Renders', async () => {
    await setup();
    expect(screen.getByText('Menu 1')).toBeInTheDocument();
  });

  test('Highlighted link', async () => {
    await setup('/link1');

    const link1 = screen.getByText('Link 1');
    expect(link1).toBeInTheDocument();

    const link2 = screen.getByText('Link 2');
    expect(link2).toBeInTheDocument();

    const link3 = screen.getByText('Link 3');
    expect(link3).toBeInTheDocument();

    expect(link1.parentElement?.dataset?.['active']).toEqual('true');
    expect(link2.parentElement?.dataset?.['active']).toBeUndefined();
    expect(link3.parentElement?.dataset?.['active']).toBeUndefined();
  });

  test('Highlighted by search params', async () => {
    await setup('/link?key=4');

    const link1 = screen.getByText('Link 4');
    expect(link1).toBeInTheDocument();

    const link2 = screen.getByText('Link 5');
    expect(link2).toBeInTheDocument();

    const link3 = screen.getByText('Link 6');
    expect(link3).toBeInTheDocument();

    expect(link1.parentElement?.dataset?.['active']).toEqual('true');
    expect(link2.parentElement?.dataset?.['active']).toBeUndefined();
    expect(link3.parentElement?.dataset?.['active']).toBeUndefined();
  });

  test('Highlighted link ignores _offset', async () => {
    await setup('/link?key=4&_offset=10');

    const link1 = screen.getByText('Link 4');
    expect(link1).toBeInTheDocument();

    const link2 = screen.getByText('Link 5');
    expect(link2).toBeInTheDocument();

    const link3 = screen.getByText('Link 6');
    expect(link3).toBeInTheDocument();

    expect(link1.parentElement?.dataset?.['active']).toEqual('true');
    expect(link2.parentElement?.dataset?.['active']).toBeUndefined();
    expect(link3.parentElement?.dataset?.['active']).toBeUndefined();
  });

  test('Click link on desktop', async () => {
    window.innerWidth = 1024;
    await setup();
    expect(screen.getByText('Link 1')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByText('Link 1'));
    });

    expect(navigateMock).toHaveBeenCalledWith('/link1');
    expect(closeMock).not.toHaveBeenCalled();
  });

  test('Click link on mobile', async () => {
    window.innerWidth = 400;
    await setup();
    expect(screen.getByText('Link 1')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByText('Link 1'));
    });

    expect(navigateMock).toHaveBeenCalledWith('/link1');
    expect(closeMock).toHaveBeenCalled();
  });

  test('Resource Type Search', async () => {
    await setup();

    const input = screen.getByPlaceholderText('Resource Type');

    // Enter random text
    await act(async () => {
      fireEvent.change(input, { target: { value: 'Test' } });
    });

    // Wait for the drop down
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });

    // Press the down arrow
    await act(async () => {
      fireEvent.keyDown(input, { key: 'ArrowDown', code: 'ArrowDown' });
    });

    // Press "Enter"
    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
    });

    expect(navigateMock).toHaveBeenCalledWith('/test-code');
  });

  test('Add Bookmark render and submit', async () => {
    await setup();

    const button = screen.getByRole('button', { name: 'Add Bookmark' });

    await act(async () => {
      fireEvent.click(button);
    });

    const input = await screen.findByPlaceholderText('Bookmark Name');

    expect(input).toBeInTheDocument();

    // Enter random text
    await act(async () => {
      fireEvent.change(input, { target: { value: 'Test' } });
    });

    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
    });
  });

  test('Add Bookmark close', async () => {
    await setup();

    const button = screen.getByRole('button', { name: 'Add Bookmark' });

    await act(async () => {
      fireEvent.click(button);
    });

    const input = await screen.findByPlaceholderText('Bookmark Name');

    expect(input).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    });
  });

  test('Add Bookmark save', async () => {
    await setup();

    const button = screen.getByRole('button', { name: 'Add Bookmark' });

    await act(async () => {
      fireEvent.click(button);
    });

    const input = await screen.findByPlaceholderText('Bookmark Name');

    expect(input).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    });
  });
});

describe('NavbarLinkWithSubscription', () => {
  let subscriptionMedplum: MockClient;
  const subscriptionNavigateMock = jest.fn();
  const subscriptionToggleMock = jest.fn();
  const subscriptionCloseMock = jest.fn();

  const subscriptionMenus: NavbarMenu[] = [
    {
      title: 'Inbox',
      links: [
        {
          label: 'Messages',
          href: '/Communication',
          icon: <IconMail />,
          alert: true,
          notificationCount: {
            resourceType: 'Communication',
            countCriteria: 'recipient=Practitioner/456&_summary=count',
            subscriptionCriteria: 'Communication?recipient=Practitioner/456',
          },
        },
        { label: 'Tasks', href: '/Task' },
      ],
    },
  ];

  async function setupSubscription(initial = '/', opened = true): Promise<void> {
    const initialUrl = new URL(initial, 'http://localhost');
    await act(async () => {
      render(
        <MedplumProvider medplum={subscriptionMedplum} navigate={subscriptionNavigateMock}>
          <MantineAppShell>
            <Navbar
              logo={<div>Logo</div>}
              pathname={initialUrl.pathname}
              searchParams={initialUrl.searchParams}
              navbarToggle={subscriptionToggleMock}
              closeNavbar={subscriptionCloseMock}
              menus={subscriptionMenus}
              opened={opened}
            />
          </MantineAppShell>
        </MedplumProvider>
      );
    });
  }

  beforeEach(() => {
    subscriptionMedplum = new MockClient();
    jest.useFakeTimers();
    subscriptionNavigateMock.mockClear();
    subscriptionCloseMock.mockClear();
  });

  afterEach(async () => {
    await act(async () => {
      jest.runOnlyPendingTimers();
    });
    jest.useRealTimers();
  });

  test('Renders subscription link', async () => {
    await setupSubscription();
    expect(screen.getByText('Messages')).toBeInTheDocument();
    expect(screen.getByText('Tasks')).toBeInTheDocument();
  });

  test('Shows count after subscription event', async () => {
    await setupSubscription();

    // Initially no count displayed
    expect(screen.queryByText('1')).not.toBeInTheDocument();

    // Create a resource that matches the criteria
    const communication = await subscriptionMedplum.createResource<Communication>({
      resourceType: 'Communication',
      status: 'in-progress',
      recipient: [{ reference: 'Practitioner/456' }],
    });

    // Emit subscription event to trigger re-fetch
    await act(async () => {
      subscriptionMedplum.getSubscriptionManager().emitEventForCriteria<'message'>(
        'Communication?recipient=Practitioner/456',
        {
          type: 'message',
          payload: { resourceType: 'Bundle', id: communication.id, type: 'history' },
        }
      );
    });

    expect(await screen.findByText('1')).toBeInTheDocument();
  });

  test('Click subscription link navigates', async () => {
    window.innerWidth = 1024;
    await setupSubscription();

    await act(async () => {
      fireEvent.click(screen.getByText('Messages'));
    });

    expect(subscriptionNavigateMock).toHaveBeenCalledWith('/Communication');
    expect(subscriptionCloseMock).not.toHaveBeenCalled();
  });

  test('Shows alert dot when collapsed with count', async () => {
    await setupSubscription('/', false);

    const communication = await subscriptionMedplum.createResource<Communication>({
      resourceType: 'Communication',
      status: 'in-progress',
      recipient: [{ reference: 'Practitioner/456' }],
    });

    await act(async () => {
      subscriptionMedplum.getSubscriptionManager().emitEventForCriteria<'message'>(
        'Communication?recipient=Practitioner/456',
        {
          type: 'message',
          payload: { resourceType: 'Bundle', id: communication.id, type: 'history' },
        }
      );
    });

    const alertDot = document.querySelector('[class*="alertDot"]');
    expect(alertDot).toBeInTheDocument();
  });

  test('Shows alert-styled count when expanded with count', async () => {
    await setupSubscription('/', true);

    const communication = await subscriptionMedplum.createResource<Communication>({
      resourceType: 'Communication',
      status: 'in-progress',
      recipient: [{ reference: 'Practitioner/456' }],
    });

    await act(async () => {
      subscriptionMedplum.getSubscriptionManager().emitEventForCriteria<'message'>(
        'Communication?recipient=Practitioner/456',
        {
          type: 'message',
          payload: { resourceType: 'Bundle', id: communication.id, type: 'history' },
        }
      );
    });

    const countElement = await screen.findByText('1');
    expect(countElement.dataset?.['alert']).toEqual('true');
  });
});
