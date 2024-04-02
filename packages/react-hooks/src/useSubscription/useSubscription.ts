import { SubscriptionEmitter, SubscriptionEventMap } from '@medplum/core';
import { Bundle } from '@medplum/fhirtypes';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useMedplum } from '../MedplumProvider/MedplumProvider.context';

const SUBSCRIPTION_DEBOUNCE_MS = 3000;

export function useSubscription(criteria: string, callback: (bundle: Bundle) => void): void {
  const medplum = useMedplum();
  const [emitter, setEmitter] = useState<SubscriptionEmitter>();

  const listeningRef = useRef(false);
  const unsubTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const prevCriteriaRef = useRef<string>();

  const callbackRef = useRef<typeof callback>();
  callbackRef.current = callback;

  useEffect(() => {
    if (unsubTimerRef.current) {
      clearTimeout(unsubTimerRef.current);
      unsubTimerRef.current = undefined;
    }
    if (prevCriteriaRef.current !== criteria) {
      setEmitter(medplum.subscribeToCriteria(criteria));
    }

    // Set prev criteria to latest
    prevCriteriaRef.current = criteria;

    return () => {
      unsubTimerRef.current = setTimeout(() => {
        setEmitter(undefined);
        medplum.unsubscribeFromCriteria(criteria);
      }, SUBSCRIPTION_DEBOUNCE_MS);
    };
  }, [medplum, criteria]);

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
