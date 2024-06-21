import { SubscriptionEmitter, SubscriptionEventMap, deepEquals } from '@medplum/core';
import { Bundle, Subscription } from '@medplum/fhirtypes';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useMedplum } from '../MedplumProvider/MedplumProvider.context';

const SUBSCRIPTION_DEBOUNCE_MS = 3000;

export type UseSubscriptionOptions = {
  subscriptionProps?: Partial<Subscription>;
};

/**
 * Creates an in-memory `Subscription` resource with the given criteria on the Medplum server and calls the given callback when an event notification is triggered by a resource interaction over a WebSocket connection.
 *
 * Subscriptions created with this hook are lightweight, share a single WebSocket connection, and are automatically untracked and cleaned up when the containing component is no longer mounted.
 *
 * @param criteria - The FHIR search criteria to subscribe to.
 * @param callback - The callback to call when a notification event `Bundle` for this `Subscription` is received.
 * @param options - Optional options used to configure the created `Subscription`.
 */
export function useSubscription(
  criteria: string,
  callback: (bundle: Bundle) => void,
  options?: UseSubscriptionOptions
): void {
  const medplum = useMedplum();
  const [emitter, setEmitter] = useState<SubscriptionEmitter>();
  const [memoizedOptions, setMemoizedOptions] = useState(options);

  const listeningRef = useRef(false);
  const unsubTimerRef = useRef<ReturnType<typeof setTimeout>>();

  const prevCriteriaRef = useRef<string>();
  const prevMemoizedOptionsRef = useRef<UseSubscriptionOptions>();

  const callbackRef = useRef<typeof callback>();
  callbackRef.current = callback;

  useEffect(() => {
    if (memoizedOptions !== options && !deepEquals(memoizedOptions, options)) {
      setMemoizedOptions(options);
    }
  }, [memoizedOptions, options]);

  useEffect(() => {
    if (unsubTimerRef.current) {
      clearTimeout(unsubTimerRef.current);
      unsubTimerRef.current = undefined;
    }

    if (prevCriteriaRef.current !== criteria || !deepEquals(prevMemoizedOptionsRef.current, memoizedOptions)) {
      setEmitter(medplum.subscribeToCriteria(criteria, memoizedOptions?.subscriptionProps));
    }

    // Set prev criteria and options to latest after checking them
    prevCriteriaRef.current = criteria;
    prevMemoizedOptionsRef.current = memoizedOptions;

    return () => {
      unsubTimerRef.current = setTimeout(() => {
        setEmitter(undefined);
        medplum.unsubscribeFromCriteria(criteria, memoizedOptions?.subscriptionProps);
      }, SUBSCRIPTION_DEBOUNCE_MS);
    };
  }, [medplum, criteria, memoizedOptions]);

  const emitterCallback = useCallback((event: SubscriptionEventMap['message']) => {
    callbackRef.current?.(event.payload);
  }, []);

  useEffect(() => {
    if (!emitter) {
      return () => undefined;
    }
    if (!listeningRef.current) {
      emitter.addEventListener('message', emitterCallback);
      listeningRef.current = true;
    }
    return () => {
      listeningRef.current = false;
      emitter.removeEventListener('message', emitterCallback);
    };
  }, [emitter, emitterCallback]);
}
