// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { useMedplum } from '@medplum/react-hooks';
import { useState, useCallback } from 'react';

interface LiveKitTokenState {
  token: string | null;
  roomName: string | null;
  livekitHost: string | null;
  loading: boolean;
  error: string | null;
}

/**
 * Low-level hook for fetching a LiveKit token from the generate-token bot.
 * Use `useVideoVisit` for the full lifecycle; this hook is useful when you
 * only need token generation (e.g. for custom room UIs).
 *
 * @param generateTokenBotId - The Bot resource ID for the generate-token bot.
 * @returns The token state and a `fetchToken` function to request a new token.
 */
export function useLiveKitToken(generateTokenBotId: string): LiveKitTokenState & {
  fetchToken: (encounterId: string, role: 'provider' | 'patient' | 'observer') => Promise<any>;
} {
  const medplum = useMedplum();
  const [state, setState] = useState<LiveKitTokenState>({
    token: null,
    roomName: null,
    livekitHost: null,
    loading: false,
    error: null,
  });

  const fetchToken = useCallback(
    async (encounterId: string, role: 'provider' | 'patient' | 'observer') => {
      setState((s) => ({ ...s, loading: true, error: null }));
      try {
        const result = await medplum.executeBot(
          generateTokenBotId,
          { encounterId, participantRole: role },
          'application/json'
        );
        setState({
          token: result.token,
          roomName: result.roomName,
          livekitHost: result.livekitHost,
          loading: false,
          error: null,
        });
        return result;
      } catch (err: any) {
        setState((s) => ({ ...s, loading: false, error: err.message }));
        return null;
      }
    },
    [medplum, generateTokenBotId]
  );

  return { ...state, fetchToken };
}
