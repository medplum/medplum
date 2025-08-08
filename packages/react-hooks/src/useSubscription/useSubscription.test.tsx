// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { SubscriptionEmitter, generateId } from '@medplum/core';
import { Bundle } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { act, render, screen } from '@testing-library/react';
import 'jest-websocket-mock';
import { JSX, ReactNode, StrictMode, useCallback, useState } from 'react';
import { MemoryRouter } from 'react-router';
import { MedplumProvider } from '../MedplumProvider/MedplumProvider';
import { UseSubscriptionOptions, useSubscription } from './useSubscription';

const MOCK_SUBSCRIPTION_ID = '7b081dd8-a2d2-40dd-9596-58a7305a73b0';

function TestComponent({
  criteria,
  callback,
  options,
}: {
  criteria: string | undefined;
  callback?: (bundle: Bundle) => void;
  options?: UseSubscriptionOptions;
}): JSX.Element {
  const [lastReceived, setLastReceived] = useState<Bundle>();
  useSubscription(
    criteria,
    callback ??
      ((bundle: Bundle) => {
        setLastReceived(bundle);
      }),
    options
  );
  return (
    <div>
      <div data-testid="bundle">{JSON.stringify(lastReceived)}</div>
    </div>
  );
}

function RenderToggleComponent({ render }: { render: boolean }): JSX.Element {
  return <>{render ? <TestComponent criteria="Communication" /> : null}</>;
}

describe('useSubscription()', () => {
  let medplum: MockClient;

  beforeAll(() => {
    jest.useFakeTimers();
  });

  beforeEach(() => {
    medplum = new MockClient();
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  function setup(
    children: ReactNode,
    strict = false
  ): {
    unmount: ReturnType<typeof render>['unmount'];
    rerender: (element: JSX.Element) => void;
  } {
    const defaultWrapper = (children: ReactNode): JSX.Element => (
      <MemoryRouter>
        <MedplumProvider medplum={medplum}>{children}</MedplumProvider>
      </MemoryRouter>
    );

    const strictWrapper = (children: ReactNode): JSX.Element => {
      return <StrictMode>{defaultWrapper(children)}</StrictMode>;
    };

    const wrapper = strict ? strictWrapper : defaultWrapper;
    const { unmount, rerender } = render(wrapper(children));
    return { unmount, rerender: (element: JSX.Element) => rerender(wrapper(element)) };
  }

  test('Mount and unmount completely', async () => {
    const { unmount } = setup(<TestComponent criteria="Communication" />);

    act(() => {
      medplum.getSubscriptionManager().emitEventForCriteria<'message'>('Communication', {
        type: 'message',
        payload: { resourceType: 'Bundle', id: generateId(), type: 'history' },
      });
    });

    const el = await screen.findByTestId('bundle');
    expect(el).toBeInTheDocument();

    const bundle = JSON.parse(el.innerHTML);
    expect(bundle.resourceType).toBe('Bundle');
    expect(bundle.type).toBe('history');

    // Make sure subscription is cleaned up
    unmount();
    jest.advanceTimersByTime(5000);
    expect(medplum.getSubscriptionManager().getCriteriaCount()).toEqual(0);
  });

  test('Mount and remount before debounce timeout', async () => {
    expect(medplum.getSubscriptionManager().getCriteriaCount()).toEqual(0);
    const { rerender } = setup(<RenderToggleComponent render={true} />);
    expect(medplum.getSubscriptionManager().getCriteriaCount()).toEqual(1);

    const emitter = medplum.getSubscriptionManager().getEmitter('Communication') as SubscriptionEmitter;
    expect(emitter).toBeInstanceOf(SubscriptionEmitter);
    expect(medplum.getSubscriptionManager().getCriteriaCount()).toEqual(1);

    rerender(<RenderToggleComponent render={false} />);
    jest.advanceTimersByTime(1000);
    expect(medplum.getSubscriptionManager().getCriteriaCount()).toEqual(1);

    rerender(<RenderToggleComponent render={true} />);
    jest.advanceTimersByTime(5000);
    expect(medplum.getSubscriptionManager().getCriteriaCount()).toEqual(1);
    expect(medplum.getSubscriptionManager().getEmitter('Communication')).toBe(emitter);

    // Make sure we fully unmount later when actually unmounting
    rerender(<RenderToggleComponent render={false} />);
    jest.advanceTimersByTime(5000);
    expect(medplum.getSubscriptionManager().getCriteriaCount()).toEqual(0);
  });

  test('Debounces properly in StrictMode', async () => {
    expect(medplum.getSubscriptionManager().getCriteriaCount()).toEqual(0);
    const emitter = medplum.getSubscriptionManager().addCriteria('Communication');
    expect(medplum.getSubscriptionManager().getCriteriaCount()).toEqual(1);

    setup(<TestComponent criteria="Communication" />, true);
    jest.advanceTimersByTime(5000);
    expect(medplum.getSubscriptionManager().getCriteriaCount()).toEqual(1);
    expect(medplum.getSubscriptionManager().getEmitter('Communication')).toBe(emitter);
  });

  test('Callback changed', async () => {
    let lastFromCb1: Bundle | undefined;
    let lastFromCb2: Bundle | undefined;
    const id1 = generateId();
    const id2 = generateId();

    const { rerender } = setup(
      <TestComponent
        criteria="Communication"
        callback={(bundle: Bundle) => {
          lastFromCb1 = bundle;
        }}
      />
    );

    act(() => {
      medplum.getSubscriptionManager().emitEventForCriteria<'message'>('Communication', {
        type: 'message',
        payload: { resourceType: 'Bundle', id: id1, type: 'history' },
      });
    });

    expect(lastFromCb1?.resourceType).toEqual('Bundle');
    expect(lastFromCb1?.type).toEqual('history');
    expect(lastFromCb1?.id).toEqual(id1);
    expect(lastFromCb2).not.toBeDefined();

    rerender(
      <TestComponent
        criteria="Communication"
        callback={(bundle: Bundle) => {
          lastFromCb2 = bundle;
        }}
      />
    );

    act(() => {
      medplum.getSubscriptionManager().emitEventForCriteria<'message'>('Communication', {
        type: 'message',
        payload: { resourceType: 'Bundle', id: id2, type: 'history' },
      });
    });

    expect(lastFromCb1?.resourceType).toEqual('Bundle');
    expect(lastFromCb1?.type).toEqual('history');
    expect(lastFromCb1?.id).toEqual(id1);

    expect(lastFromCb2?.resourceType).toEqual('Bundle');
    expect(lastFromCb2?.type).toEqual('history');
    expect(lastFromCb2?.id).toEqual(id2);
  });

  test('Criteria changed', () => {
    let lastFromCb1: Bundle | undefined;
    let lastFromCb2: Bundle | undefined;
    const id1 = generateId();
    const id2 = generateId();
    const id3 = generateId();

    const { rerender } = setup(
      <TestComponent
        criteria="Communication"
        callback={(bundle: Bundle) => {
          lastFromCb1 = bundle;
        }}
      />
    );

    // Emit an event that would trigger the current callback to be called based on the criteria
    act(() => {
      medplum.getSubscriptionManager().emitEventForCriteria<'message'>('Communication', {
        type: 'message',
        payload: { resourceType: 'Bundle', id: id1, type: 'history' },
      });
    });

    // Make sure it was called
    expect(lastFromCb1?.resourceType).toEqual('Bundle');
    expect(lastFromCb1?.type).toEqual('history');
    expect(lastFromCb1?.id).toEqual(id1);
    expect(lastFromCb2).not.toBeDefined();

    // Re-render with a new criteria that does not overlap
    rerender(
      <TestComponent
        criteria="DiagnosticReport"
        callback={(bundle: Bundle) => {
          lastFromCb2 = bundle;
        }}
      />
    );

    // Emit an event that would trigger the old criteria
    act(() => {
      medplum.getSubscriptionManager().emitEventForCriteria<'message'>('Communication', {
        type: 'message',
        payload: { resourceType: 'Bundle', id: id2, type: 'history' },
      });
    });

    // Make sure it doesn't get called
    expect(lastFromCb1?.resourceType).toEqual('Bundle');
    expect(lastFromCb1?.type).toEqual('history');
    expect(lastFromCb1?.id).toEqual(id1);
    expect(lastFromCb2).not.toBeDefined();

    // Emit an event for the new criteria
    act(() => {
      medplum.getSubscriptionManager().emitEventForCriteria<'message'>('DiagnosticReport', {
        type: 'message',
        payload: { resourceType: 'Bundle', id: id3, type: 'history' },
      });
    });

    // Make sure old criteria still has first event as last received message
    expect(lastFromCb1?.resourceType).toEqual('Bundle');
    expect(lastFromCb1?.type).toEqual('history');
    expect(lastFromCb1?.id).toEqual(id1);

    // Make sure last event was received on the callback for the current criteria
    expect(lastFromCb2?.resourceType).toEqual('Bundle');
    expect(lastFromCb2?.type).toEqual('history');
    expect(lastFromCb2?.id).toEqual(id3);
  });

  test('subscriptionProps changed', () => {
    let lastFromCb1: Bundle | undefined;
    let lastFromCb2: Bundle | undefined;
    const id1 = generateId();
    const id2 = generateId();
    const id3 = generateId();

    const { rerender } = setup(
      <TestComponent
        criteria="Communication"
        callback={(bundle: Bundle) => {
          lastFromCb1 = bundle;
        }}
        options={{
          subscriptionProps: {
            extension: [
              {
                url: 'https://medplum.com/fhir/StructureDefinition/subscription-supported-interaction',
                valueCode: 'create',
              },
            ],
          },
        }}
      />
    );

    // Emit an event that would trigger the current callback to be called based on the criteria
    act(() => {
      medplum.getSubscriptionManager().emitEventForCriteria<'message'>(
        'Communication',
        {
          type: 'message',
          payload: { resourceType: 'Bundle', id: id1, type: 'history' },
        },
        {
          extension: [
            {
              url: 'https://medplum.com/fhir/StructureDefinition/subscription-supported-interaction',
              valueCode: 'create',
            },
          ],
        }
      );
    });

    // Make sure it was called
    expect(lastFromCb1?.resourceType).toEqual('Bundle');
    expect(lastFromCb1?.type).toEqual('history');
    expect(lastFromCb1?.id).toEqual(id1);
    expect(lastFromCb2).not.toBeDefined();

    // Re-render with a new criteria + options combo that does not overlap
    rerender(
      <TestComponent
        criteria="Communication"
        callback={(bundle: Bundle) => {
          lastFromCb2 = bundle;
        }}
      />
    );

    // Emit an event that would trigger the old criteria + options
    act(() => {
      medplum.getSubscriptionManager().emitEventForCriteria<'message'>(
        'Communication',
        {
          type: 'message',
          payload: { resourceType: 'Bundle', id: id2, type: 'history' },
        },
        {
          extension: [
            {
              url: 'https://medplum.com/fhir/StructureDefinition/subscription-supported-interaction',
              valueCode: 'create',
            },
          ],
        }
      );
    });

    // Make sure it doesn't get called
    expect(lastFromCb1?.resourceType).toEqual('Bundle');
    expect(lastFromCb1?.type).toEqual('history');
    expect(lastFromCb1?.id).toEqual(id1);
    expect(lastFromCb2).not.toBeDefined();

    // Emit an event for the new criteria
    act(() => {
      medplum.getSubscriptionManager().emitEventForCriteria<'message'>('Communication', {
        type: 'message',
        payload: { resourceType: 'Bundle', id: id3, type: 'history' },
      });
    });

    // Make sure old criteria still has first event as last received message
    expect(lastFromCb1?.resourceType).toEqual('Bundle');
    expect(lastFromCb1?.type).toEqual('history');
    expect(lastFromCb1?.id).toEqual(id1);

    // Make sure last event was received on the callback for the current criteria
    expect(lastFromCb2?.resourceType).toEqual('Bundle');
    expect(lastFromCb2?.type).toEqual('history');
    expect(lastFromCb2?.id).toEqual(id3);
  });

  test('Empty criteria should temporarily unsubscribe', async () => {
    let lastFromCb1: Bundle | undefined;
    let lastFromCb2: Bundle | undefined;
    let lastFromCb3: Bundle | undefined;
    let lastFromCb4: Bundle | undefined;

    const id1 = generateId();
    const id2 = generateId();
    const id3 = generateId();
    const id4 = generateId();

    const { rerender } = setup(
      <TestComponent
        criteria="Communication"
        callback={(bundle: Bundle) => {
          lastFromCb1 = bundle;
        }}
      />
    );

    // Emit an event that would trigger the current callback to be called based on the criteria
    act(() => {
      medplum.getSubscriptionManager().emitEventForCriteria<'message'>('Communication', {
        type: 'message',
        payload: { resourceType: 'Bundle', id: id1, type: 'history' },
      });
    });

    // Make sure it was called
    expect(lastFromCb1?.resourceType).toEqual('Bundle');
    expect(lastFromCb1?.type).toEqual('history');
    expect(lastFromCb1?.id).toEqual(id1);
    expect(lastFromCb2).not.toBeDefined();
    expect(lastFromCb3).not.toBeDefined();

    // Re-render with a new empty string criteria
    rerender(
      <TestComponent
        criteria=""
        callback={(bundle: Bundle) => {
          lastFromCb2 = bundle;
        }}
      />
    );

    act(() => {
      medplum.getSubscriptionManager().emitEventForCriteria<'message'>('Communication', {
        type: 'message',
        payload: { resourceType: 'Bundle', id: id2, type: 'history' },
      });
    });

    // Make sure it doesn't get called
    expect(lastFromCb1?.resourceType).toEqual('Bundle');
    expect(lastFromCb1?.type).toEqual('history');
    expect(lastFromCb1?.id).toEqual(id1);
    expect(lastFromCb2).not.toBeDefined();
    expect(lastFromCb3).not.toBeDefined();

    // Re-render with undefined criteria
    rerender(
      <TestComponent
        criteria={undefined}
        callback={(bundle: Bundle) => {
          lastFromCb3 = bundle;
        }}
      />
    );

    act(() => {
      medplum.getSubscriptionManager().emitEventForCriteria<'message'>('Communication', {
        type: 'message',
        payload: { resourceType: 'Bundle', id: id3, type: 'history' },
      });
    });

    // Make sure old criteria still has first event as last received message
    expect(lastFromCb1?.resourceType).toEqual('Bundle');
    expect(lastFromCb1?.type).toEqual('history');
    expect(lastFromCb1?.id).toEqual(id1);

    expect(lastFromCb2).toBeUndefined();
    expect(lastFromCb3).toBeUndefined();

    // Re-render with the old criteria
    rerender(
      <TestComponent
        criteria="Communication"
        callback={(bundle: Bundle) => {
          lastFromCb4 = bundle;
        }}
      />
    );

    act(() => {
      medplum.getSubscriptionManager().emitEventForCriteria<'message'>('Communication', {
        type: 'message',
        payload: { resourceType: 'Bundle', id: id4, type: 'history' },
      });
    });

    // Make sure old criteria still has first event as last received message
    expect(lastFromCb1?.resourceType).toEqual('Bundle');
    expect(lastFromCb1?.type).toEqual('history');
    expect(lastFromCb1?.id).toEqual(id1);

    expect(lastFromCb2).toBeUndefined();
    expect(lastFromCb3).toBeUndefined();

    expect(lastFromCb4?.resourceType).toEqual('Bundle');
    expect(lastFromCb4?.type).toEqual('history');
    expect(lastFromCb4?.id).toEqual(id4);
  });

  test('WebSocket disconnects and reconnects', async () => {
    let lastFromCb: Bundle | undefined;
    const id = generateId();
    let wsOpenedTimes = 0;
    let wsClosedTimes = 0;

    const connectMap = new Map<string, number>();
    connectMap.set(MOCK_SUBSCRIPTION_ID, 0);

    setup(
      <TestComponent
        criteria="Communication"
        callback={(bundle: Bundle) => {
          lastFromCb = bundle;
        }}
        options={{
          onWebSocketOpen: () => {
            wsOpenedTimes++;
          },
          onWebSocketClose: () => {
            wsClosedTimes++;
          },
          onSubscriptionConnect: (subscriptionId: string) => {
            connectMap.set(subscriptionId, (connectMap.get(MOCK_SUBSCRIPTION_ID) ?? 0) + 1);
          },
        }}
      />
    );

    expect(connectMap.get(MOCK_SUBSCRIPTION_ID)).toEqual(0);

    act(() => {
      medplum.getSubscriptionManager().emitEventForCriteria<'message'>('Communication', {
        type: 'message',
        payload: { resourceType: 'Bundle', id, type: 'history' },
      });
    });

    expect(lastFromCb?.resourceType).toEqual('Bundle');
    expect(lastFromCb?.type).toEqual('history');
    expect(lastFromCb?.id).toEqual(id);

    const closePromise = new Promise<{ type: 'close' }>((resolve) => {
      medplum.getMasterSubscriptionEmitter().addEventListener('close', (event) => {
        resolve(event);
      });
    });

    act(() => {
      medplum.getSubscriptionManager().emitEventForCriteria<'close'>('Communication', {
        type: 'close',
      });
    });

    const closeEvent = await closePromise;
    expect(closeEvent.type).toEqual('close');

    expect(wsClosedTimes).toEqual(1);

    const openPromise2 = new Promise<{ type: 'open' }>((resolve) => {
      medplum.getMasterSubscriptionEmitter().addEventListener('open', (event) => {
        resolve(event);
      });
    });

    act(() => {
      medplum.getSubscriptionManager().emitEventForCriteria<'open'>('Communication', {
        type: 'open',
      });
    });

    const openEvent2 = await openPromise2;
    expect(openEvent2.type).toEqual('open');

    expect(wsOpenedTimes).toEqual(1);

    const connectPromise = new Promise<{ type: 'connect' }>((resolve) => {
      medplum.getMasterSubscriptionEmitter().addEventListener('connect', (event) => {
        resolve(event);
      });
    });

    act(() => {
      medplum.getSubscriptionManager().emitEventForCriteria<'connect'>('Communication', {
        type: 'connect',
        payload: { subscriptionId: MOCK_SUBSCRIPTION_ID },
      });
    });

    const connectEvent = await connectPromise;
    expect(connectEvent.type).toEqual('connect');
    expect(connectMap.get(MOCK_SUBSCRIPTION_ID)).toEqual(1);
  });

  test('Only get one call per update', async () => {
    function NotificationComponent(): JSX.Element {
      const [notifications, setNotifications] = useState(0);
      useSubscription('Communication', (_bundle: Bundle) => {
        setNotifications((s) => s + 1);
      });
      return (
        <div>
          <div data-testid="notification-count">{notifications}</div>
        </div>
      );
    }

    setup(<NotificationComponent />);

    act(() => {
      medplum.getSubscriptionManager().emitEventForCriteria<'message'>('Communication', {
        type: 'message',
        payload: { resourceType: 'Bundle', id: generateId(), type: 'history' },
      });
    });

    await expect(screen.findByTestId('notification-count')).resolves.toBeInTheDocument();
    expect(screen.getByTestId<HTMLDivElement>('notification-count')?.innerHTML).toEqual('1');

    act(() => {
      medplum.getSubscriptionManager().emitEventForCriteria<'message'>('Communication', {
        type: 'message',
        payload: { resourceType: 'Bundle', id: generateId(), type: 'history' },
      });
    });

    expect(screen.getByTestId<HTMLDivElement>('notification-count')?.innerHTML).toEqual('2');
  });

  test('Changing callback should not recreate Subscription', async () => {
    const subscribeSpy = jest.spyOn(medplum, 'subscribeToCriteria');
    let callsToOpen = 0;

    function TestWrapper(): JSX.Element {
      const [count, setCount] = useState(0);
      return (
        <TestComponent
          criteria="Communication"
          options={{
            subscriptionProps: {
              extension: [
                {
                  url: 'https://medplum.com/fhir/StructureDefinition/subscription-supported-interaction',
                  valueCode: 'create',
                },
              ],
            },
            onWebSocketOpen: useCallback(() => {
              callsToOpen++;
              setCount(count + 1);
            }, [count]),
          }}
        />
      );
    }

    const openedPromise1 = new Promise((resolve) => {
      medplum.getMasterSubscriptionEmitter().addEventListener('open', resolve);
    });

    setup(<TestWrapper />);

    // Emit open to recompute the onWebSocketOpen callback, which previous busted the options memo and cause `subscribeToCriteria` to be called again
    act(() => {
      medplum.getSubscriptionManager().emitEventForCriteria<'open'>(
        'Communication',
        {
          type: 'open',
        },
        {
          extension: [
            {
              url: 'https://medplum.com/fhir/StructureDefinition/subscription-supported-interaction',
              valueCode: 'create',
            },
          ],
        }
      );
    });

    await openedPromise1;

    expect(callsToOpen).toEqual(1);
    expect(subscribeSpy).toHaveBeenCalledTimes(1);

    const openedPromise2 = new Promise((resolve) => {
      medplum.getMasterSubscriptionEmitter().addEventListener('open', resolve);
    });

    // Emit open to recompute the onWebSocketOpen callback, which previous busted the options memo and cause `subscribeToCriteria` to be called again
    act(() => {
      medplum.getSubscriptionManager().emitEventForCriteria<'open'>(
        'Communication',
        {
          type: 'open',
        },
        {
          extension: [
            {
              url: 'https://medplum.com/fhir/StructureDefinition/subscription-supported-interaction',
              valueCode: 'create',
            },
          ],
        }
      );
    });

    await openedPromise2;

    expect(callsToOpen).toEqual(2);
    expect(subscribeSpy).toHaveBeenCalledTimes(1);
  });

  test('Error emitted', async () => {
    let lastError: Error | undefined;

    function TestWrapper(): JSX.Element {
      return (
        <TestComponent
          criteria="Communication"
          options={{
            subscriptionProps: {
              extension: [
                {
                  url: 'https://medplum.com/fhir/StructureDefinition/subscription-supported-interaction',
                  valueCode: 'create',
                },
              ],
            },
            onError: useCallback((err: Error) => {
              lastError = err;
            }, []),
          }}
        />
      );
    }

    const errorPromise = new Promise((resolve) => {
      medplum.getMasterSubscriptionEmitter().addEventListener('error', resolve);
    });

    setup(<TestWrapper />);

    // Emit open to recompute the onWebSocketOpen callback, which previous busted the options memo and cause `subscribeToCriteria` to be called again
    act(() => {
      medplum.getSubscriptionManager().emitEventForCriteria<'error'>(
        'Communication',
        {
          type: 'error',
          payload: new Error('Something is broken'),
        },
        {
          extension: [
            {
              url: 'https://medplum.com/fhir/StructureDefinition/subscription-supported-interaction',
              valueCode: 'create',
            },
          ],
        }
      );
    });

    await errorPromise;

    expect(lastError).toEqual(new Error('Something is broken'));
  });
});
