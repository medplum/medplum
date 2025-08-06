// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { SubscriptionEmitter, SubscriptionEventMap, deepEquals } from '@medplum/core';
import { Bundle, Subscription } from '@medplum/fhirtypes';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useMedplum } from '../MedplumProvider/MedplumProvider.context';

const SUBSCRIPTION_DEBOUNCE_MS = 3000;

export type UseSubscriptionOptions = {
  subscriptionProps?: Partial<Subscription>;
  onWebSocketOpen?: () => void;
  onWebSocketClose?: () => void;
  onSubscriptionConnect?: (subscriptionId: string) => void;
  onSubscriptionDisconnect?: (subscriptionId: string) => void;
  onError?: (err: Error) => void;
};

/**
 * Creates an in-memory `Subscription` resource with the given criteria on the Medplum server and calls the given callback when an event notification is triggered by a resource interaction over a WebSocket connection.
 *
 * Subscriptions created with this hook are lightweight, share a single WebSocket connection, and are automatically untracked and cleaned up when the containing component is no longer mounted.
 *
 * @param criteria - The FHIR search criteria to subscribe to.
 * @param callback - The callback to call when a notification event `Bundle` for this `Subscription` is received.
 * @param options - Optional options used to configure the created `Subscription`. See {@link UseSubscriptionOptions}
 *
 * --------------------------------------------------------------------------------------------------------------------------------
 *
 * `options` contains the following properties, all of which are optional:
 * - `subscriptionProps` - Allows the caller to pass a `Partial<Subscription>` to use as part of the creation
 * of the `Subscription` resource for this subscription. It enables the user namely to pass things like the `extension` property and to create
 * the `Subscription` with extensions such the {@link https://www.medplum.com/docs/subscriptions/subscription-extensions#interactions | Supported Interaction} extension which would enable to listen for `create` or `update` only events.
 * - `onWebsocketOpen` - Called when the WebSocket connection is established with Medplum server.
 * - `onWebsocketClose` - Called when the WebSocket connection disconnects.
 * - `onSubscriptionConnect` - Called when the corresponding subscription starts to receive updates after the subscription has been initialized and connected to.
 * - `onSubscriptionDisconnect` - Called when the corresponding subscription is destroyed and stops receiving updates from the server.
 * - `onError` - Called whenever an error occurs during the lifecycle of the managed subscription.
 */
export function useSubscription(
  criteria: string | undefined,
  callback: (bundle: Bundle) => void,
  options?: UseSubscriptionOptions
): void {
  const medplum = useMedplum();
  const [emitter, setEmitter] = useState<SubscriptionEmitter>();
  // We don't memoize the entire options object since it contains callbacks and if the callbacks change identity, we don't want to trigger a resubscribe to criteria
  const [memoizedSubProps, setMemoizedSubProps] = useState(options?.subscriptionProps);

  const listeningRef = useRef(false);
  const unsubTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const prevCriteriaRef = useRef<string | undefined>(undefined);
  const prevMemoizedSubPropsRef = useRef<UseSubscriptionOptions['subscriptionProps']>(undefined);

  const callbackRef = useRef<typeof callback>(callback);
  callbackRef.current = callback;

  const onWebSocketOpenRef = useRef<UseSubscriptionOptions['onWebSocketOpen']>(options?.onWebSocketOpen);
  onWebSocketOpenRef.current = options?.onWebSocketOpen;

  const onWebSocketCloseRef = useRef<UseSubscriptionOptions['onWebSocketClose']>(options?.onWebSocketClose);
  onWebSocketCloseRef.current = options?.onWebSocketClose;

  const onSubscriptionConnectRef = useRef<UseSubscriptionOptions['onSubscriptionConnect']>(
    options?.onSubscriptionConnect
  );
  onSubscriptionConnectRef.current = options?.onSubscriptionConnect;

  const onSubscriptionDisconnectRef = useRef<UseSubscriptionOptions['onSubscriptionDisconnect']>(
    options?.onSubscriptionDisconnect
  );
  onSubscriptionDisconnectRef.current = options?.onSubscriptionDisconnect;

  const onErrorRef = useRef<UseSubscriptionOptions['onError']>(options?.onError);
  onErrorRef.current = options?.onError;

  useEffect(() => {
    // Deep equals checks referential equality first
    if (!deepEquals(options?.subscriptionProps, memoizedSubProps)) {
      setMemoizedSubProps(options?.subscriptionProps);
    }
  }, [memoizedSubProps, options]);

  useEffect(() => {
    if (unsubTimerRef.current) {
      clearTimeout(unsubTimerRef.current);
      unsubTimerRef.current = undefined;
    }

    let shouldSubscribe = false;
    if (prevCriteriaRef.current !== criteria || !deepEquals(prevMemoizedSubPropsRef.current, memoizedSubProps)) {
      shouldSubscribe = true;
    }

    if (shouldSubscribe && prevCriteriaRef.current) {
      medplum.unsubscribeFromCriteria(prevCriteriaRef.current, prevMemoizedSubPropsRef.current);
    }

    // Set prev criteria and options to latest after checking them
    prevCriteriaRef.current = criteria;
    prevMemoizedSubPropsRef.current = memoizedSubProps;

    // We do this after as to not immediately trigger re-render
    if (shouldSubscribe && criteria) {
      setEmitter(medplum.subscribeToCriteria(criteria, memoizedSubProps));
    } else if (!criteria) {
      setEmitter(undefined);
    }

    return () => {
      unsubTimerRef.current = setTimeout(() => {
        setEmitter(undefined);
        if (criteria) {
          medplum.unsubscribeFromCriteria(criteria, memoizedSubProps);
        }
      }, SUBSCRIPTION_DEBOUNCE_MS);
    };
  }, [medplum, criteria, memoizedSubProps]);

  const emitterCallback = useCallback((event: SubscriptionEventMap['message']) => {
    callbackRef.current?.(event.payload);
  }, []);

  const onWebSocketOpen = useCallback(() => {
    onWebSocketOpenRef.current?.();
  }, []);

  const onWebSocketClose = useCallback(() => {
    onWebSocketCloseRef.current?.();
  }, []);

  const onSubscriptionConnect = useCallback((event: SubscriptionEventMap['connect']) => {
    onSubscriptionConnectRef.current?.(event.payload.subscriptionId);
  }, []);

  const onSubscriptionDisconnect = useCallback((event: SubscriptionEventMap['disconnect']) => {
    onSubscriptionDisconnectRef.current?.(event.payload.subscriptionId);
  }, []);

  const onError = useCallback((event: SubscriptionEventMap['error']) => {
    onErrorRef.current?.(event.payload);
  }, []);

  useEffect(() => {
    if (!emitter) {
      return () => undefined;
    }
    if (!listeningRef.current) {
      emitter.addEventListener('message', emitterCallback);
      emitter.addEventListener('open', onWebSocketOpen);
      emitter.addEventListener('close', onWebSocketClose);
      emitter.addEventListener('connect', onSubscriptionConnect);
      emitter.addEventListener('disconnect', onSubscriptionDisconnect);
      emitter.addEventListener('error', onError);
      listeningRef.current = true;
    }
    return () => {
      listeningRef.current = false;
      emitter.removeEventListener('message', emitterCallback);
      emitter.removeEventListener('open', onWebSocketOpen);
      emitter.removeEventListener('close', onWebSocketClose);
      emitter.removeEventListener('connect', onSubscriptionConnect);
      emitter.removeEventListener('disconnect', onSubscriptionDisconnect);
      emitter.removeEventListener('error', onError);
    };
  }, [
    emitter,
    emitterCallback,
    onWebSocketOpen,
    onWebSocketClose,
    onSubscriptionConnect,
    onSubscriptionDisconnect,
    onError,
  ]);
}
