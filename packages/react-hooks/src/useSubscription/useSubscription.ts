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
 * the `Subscription` with extensions such the {@link https://www.medplum.com/docs/subscriptions/subscription-extensions#interactions "Supported Interaction"} extension which would enable to listen for `create` or `update` only events.
 * - `onWebsocketOpen` - Called when the WebSocket connection is established with Medplum server.
 * - `onWebsocketClose` - Called when the WebSocket connection disconnects.
 * - `onSubscriptionConnect` - Called when the corresponding subscription starts to receive updates after the subscription has been initialized and connected to.
 * - `onSubscriptionDisconnect` - Called when the corresponding subscription is destroyed and stops receiving updates from the server.
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

  const onWebSocketOpenRef = useRef<UseSubscriptionOptions['onWebSocketOpen']>();
  onWebSocketOpenRef.current = options?.onWebSocketOpen;

  const onWebSocketCloseRef = useRef<UseSubscriptionOptions['onWebSocketClose']>();
  onWebSocketCloseRef.current = options?.onWebSocketClose;

  const onSubscriptionConnectRef = useRef<UseSubscriptionOptions['onSubscriptionConnect']>();
  onSubscriptionConnectRef.current = options?.onSubscriptionConnect;

  const onSubscriptionDisconnectRef = useRef<UseSubscriptionOptions['onSubscriptionDisconnect']>();
  onSubscriptionDisconnectRef.current = options?.onSubscriptionDisconnect;

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
      listeningRef.current = true;
    }
    return () => {
      listeningRef.current = false;
      emitter.removeEventListener('message', emitterCallback);
      emitter.removeEventListener('open', onWebSocketOpen);
      emitter.removeEventListener('close', onWebSocketClose);
      emitter.removeEventListener('connect', onSubscriptionConnect);
      emitter.removeEventListener('disconnect', onSubscriptionDisconnect);
    };
  }, [emitter, emitterCallback, onWebSocketOpen, onWebSocketClose, onSubscriptionConnect, onSubscriptionDisconnect]);
}
