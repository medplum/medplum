import { SubscriptionEmitter, generateId } from '@medplum/core';
import { Bundle } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { act, render, screen } from '@testing-library/react';
import 'jest-websocket-mock';
import { ReactNode, StrictMode, useState } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { MedplumProvider } from '../MedplumProvider/MedplumProvider';
import { useSubscription } from './useSubscription';

function TestComponent({
  criteria,
  callback,
}: {
  criteria?: string;
  callback?: (bundle: Bundle) => void;
}): JSX.Element {
  const [lastReceived, setLastReceived] = useState<Bundle>();
  useSubscription(
    criteria ?? 'Communication',
    callback ??
      ((bundle: Bundle) => {
        setLastReceived(bundle);
      })
  );
  return (
    <div>
      <div data-testid="bundle">{JSON.stringify(lastReceived)}</div>
    </div>
  );
}

function RenderToggleComponent({ render }: { render: boolean }): JSX.Element {
  return <>{render ? <TestComponent /> : null}</>;
}

describe('useSubscription()', () => {
  let medplum: MockClient;

  beforeAll(() => {
    medplum = new MockClient();
    jest.useFakeTimers();
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
    const { unmount } = setup(<TestComponent />);

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

    setup(<TestComponent />, true);
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
        criteria="DiagnosticReport"
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
    expect(lastFromCb2).not.toBeDefined();

    act(() => {
      medplum.getSubscriptionManager().emitEventForCriteria<'message'>('DiagnosticReport', {
        type: 'message',
        payload: { resourceType: 'Bundle', id: id3, type: 'history' },
      });
    });

    expect(lastFromCb1?.resourceType).toEqual('Bundle');
    expect(lastFromCb1?.type).toEqual('history');
    expect(lastFromCb1?.id).toEqual(id1);

    expect(lastFromCb2?.resourceType).toEqual('Bundle');
    expect(lastFromCb2?.type).toEqual('history');
    expect(lastFromCb2?.id).toEqual(id3);
  });
});
