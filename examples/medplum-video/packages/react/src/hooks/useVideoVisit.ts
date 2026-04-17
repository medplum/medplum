// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { useMedplum } from '@medplum/react-hooks';
import type { Encounter } from '@medplum/fhirtypes';
import { useState, useCallback, useRef } from 'react';

interface VideoVisitState {
  status: 'idle' | 'connecting' | 'waiting-room' | 'connected' | 'error' | 'ended';
  token: string | null;
  roomName: string | null;
  livekitHost: string | null;
  waitingRoom: boolean;
  error: string | null;
}

export interface UseVideoVisitReturn extends VideoVisitState {
  joinRoom: (role: 'provider' | 'patient' | 'observer') => Promise<void>;
  admitPatient: () => Promise<void>;
  startAdHocVisit: (
    patientId: string,
    practitionerId: string,
    options?: { reason?: string; gracePeriodMinutes?: number }
  ) => Promise<Encounter | undefined>;
  endVisit: () => Promise<void>;
}

/**
 * Primary hook for managing a video visit lifecycle.
 *
 * @param encounterId - The FHIR Encounter ID (empty string for pre-creation flows).
 * @param generateTokenBotId - Bot ID for the generate-token bot.
 * @param admitPatientBotId - Bot ID for the admit-patient bot.
 * @param startAdHocVisitBotId - Bot ID for the start-adhoc-visit bot.
 * @returns The video visit state and action callbacks.
 */
export function useVideoVisit(
  encounterId: string,
  generateTokenBotId?: string,
  admitPatientBotId?: string,
  startAdHocVisitBotId?: string
): UseVideoVisitReturn {
  const medplum = useMedplum();
  const [state, setState] = useState<VideoVisitState>({
    status: 'idle',
    token: null,
    roomName: null,
    livekitHost: null,
    waitingRoom: false,
    error: null,
  });

  // Use refs so callbacks don't change identity on every render
  const encounterIdRef = useRef(encounterId);
  encounterIdRef.current = encounterId;

  const joinRoom = useCallback(
    async (role: 'provider' | 'patient' | 'observer') => {
      if (!generateTokenBotId) {
        setState((s) => ({ ...s, status: 'error', error: 'generate-token bot ID not configured' }));
        return;
      }
      setState((s) => ({ ...s, status: 'connecting', error: null }));

      const MAX_ATTEMPTS = 6;
      const RETRY_MS = 1000;

      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
          const result = await medplum.executeBot(
            generateTokenBotId,
            { encounterId: encounterIdRef.current, participantRole: role },
            'application/json'
          );
          setState({
            status: result.waitingRoom ? 'waiting-room' : 'connected',
            token: result.token,
            roomName: result.roomName,
            livekitHost: result.livekitHost,
            waitingRoom: result.waitingRoom,
            error: null,
          });
          return;
        } catch (err: any) {
          const isRoomNotReady = err.message?.includes('not yet created');
          if (isRoomNotReady && attempt < MAX_ATTEMPTS) {
            await new Promise<void>((resolve) => {
              setTimeout(resolve, RETRY_MS);
            });
            continue;
          }
          setState((s) => ({ ...s, status: 'error', error: err.message }));
        }
      }
    },
    [medplum, generateTokenBotId] // stable deps — encounterId read from ref
  );

  const admitPatient = useCallback(async () => {
    if (!admitPatientBotId) {
      return;
    }
    try {
      await medplum.executeBot(
        admitPatientBotId,
        { encounterId: encounterIdRef.current },
        'application/json'
      );
    } catch (err: any) {
      console.error('Failed to admit patient:', err);
    }
  }, [medplum, admitPatientBotId]);

  const startAdHocVisit = useCallback(
    async (
      patientId: string,
      practitionerId: string,
      options?: { reason?: string; gracePeriodMinutes?: number }
    ): Promise<Encounter | undefined> => {
      if (!startAdHocVisitBotId) {
        setState((s) => ({ ...s, status: 'error', error: 'start-adhoc-visit bot ID not configured' }));
        return undefined;
      }
      try {
        return (await medplum.executeBot(
          startAdHocVisitBotId,
          { patientId, practitionerId, ...options },
          'application/json'
        )) as Encounter;
      } catch (err: any) {
        setState((s) => ({ ...s, status: 'error', error: err.message }));
        return undefined;
      }
    },
    [medplum, startAdHocVisitBotId]
  );

  const endVisit = useCallback(async () => {
    const eid = encounterIdRef.current;
    if (!eid) {
      return;
    }
    const encounter = await medplum.readResource('Encounter', eid);
    await medplum.updateResource({
      ...encounter,
      status: 'finished',
      period: { ...encounter.period, end: new Date().toISOString() },
    } as Encounter);
    setState((s) => ({ ...s, status: 'ended' }));
  }, [medplum]);

  return { ...state, joinRoom, admitPatient, startAdHocVisit, endVisit };
}
