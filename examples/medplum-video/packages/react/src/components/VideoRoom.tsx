// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { LocalUserChoices } from '@livekit/components-core';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  LiveKitRoom,
  RoomAudioRenderer,
  useRoomContext,
} from '@livekit/components-react';
import '@livekit/components-styles';
import type { AudioCaptureOptions, VideoCaptureOptions } from 'livekit-client';
import { Button, Text, Stack, Loader, Center } from '@mantine/core';

import { useVideoVisit } from '../hooks/useVideoVisit';
import { KeyboardShortcuts } from './KeyboardShortcuts';
import { MeetLayout } from './MeetLayout';
import { PerformanceOptimizer } from './PerformanceOptimizer';

export interface VideoRoomProps {
  readonly encounterId: string;
  readonly role: 'provider' | 'patient' | 'observer';
  readonly onVisitEnd?: () => void;
  readonly generateTokenBotId?: string;
  readonly admitPatientBotId?: string;
  /** Device choices from PreJoin / lobby; when omitted, default capture is used. */
  readonly initialMediaChoices?: LocalUserChoices;
  /**
   * When true, renders the end-of-call overlay. Parent is expected to set
   * this once it knows the encounter transitioned to `finished`
   * (e.g. via `useEncounterSync`).
   */
  readonly encounterEnded?: boolean;
  /** Called when the user dismisses the end-of-call screen. */
  readonly onDismissEnd?: () => void;
  /** Called when the user submits a star rating. */
  readonly onFeedback?: (stars: number) => void;
}

function videoCaptureFromChoices(choices: LocalUserChoices): boolean | VideoCaptureOptions {
  if (!choices.videoEnabled) {
    return false;
  }
  if (choices.videoDeviceId) {
    return { deviceId: choices.videoDeviceId };
  }
  return true;
}

function audioCaptureFromChoices(choices: LocalUserChoices): boolean | AudioCaptureOptions {
  if (!choices.audioEnabled) {
    return false;
  }
  if (choices.audioDeviceId) {
    return { deviceId: choices.audioDeviceId };
  }
  return true;
}

function getLiveKitMediaProps(
  role: 'provider' | 'patient' | 'observer',
  choices: LocalUserChoices | undefined
): {
  video: boolean | VideoCaptureOptions;
  audio: boolean | AudioCaptureOptions;
} {
  if (role === 'observer') {
    return { video: false, audio: false };
  }
  if (!choices) {
    return { video: true, audio: true };
  }

  return {
    video: videoCaptureFromChoices(choices),
    audio: audioCaptureFromChoices(choices),
  };
}

/**
 * Self-contained video visit component.
 *
 * Acquires a LiveKit token on mount (once), connects to the LiveKit room,
 * and renders the Meet-style layout ({@link MeetLayout}). Releases camera /
 * mic on unmount and `beforeunload` to prevent leaked media tracks.
 *
 * @param props - Component props.
 * @param props.encounterId - FHIR Encounter id for token generation.
 * @param props.role - Participant role (affects publishing and controls).
 * @param props.generateTokenBotId - Optional Medplum bot id for tokens.
 * @param props.admitPatientBotId - Optional admit bot id.
 * @param props.initialMediaChoices - Optional PreJoin device choices.
 * @param props.onVisitEnd - Called when the user taps End / Leave.
 * @param props.encounterEnded - Show end-of-call overlay when true.
 * @param props.onDismissEnd - Handler for overlay dismiss.
 * @param props.onFeedback - Handler for post-visit star rating.
 * @returns The video room UI or loading/error states.
 */
export function VideoRoom({
  encounterId,
  role,
  generateTokenBotId,
  admitPatientBotId,
  initialMediaChoices,
  onVisitEnd,
  encounterEnded,
  onDismissEnd,
  onFeedback,
}: VideoRoomProps): React.JSX.Element | null {
  const { status, token, livekitHost, joinRoom, endVisit, error } =
    useVideoVisit(encounterId, generateTokenBotId, admitPatientBotId);

  const joinedRef = useRef(false);
  const [localEnded, setLocalEnded] = useState<boolean>(false);

  const { video: videoCapture, audio: audioCapture } = useMemo(
    () => getLiveKitMediaProps(role, initialMediaChoices),
    [role, initialMediaChoices]
  );

  const roomOptions = useMemo(
    () => ({
      adaptiveStream: { pixelDensity: 'screen' as const },
      dynacast: true,
    }),
    []
  );

  useEffect(() => {
    if (joinedRef.current) {
      return;
    }
    joinedRef.current = true;
    joinRoom(role).catch(() => undefined);
  }, [encounterId, role]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleEnd(): Promise<void> {
    setLocalEnded(true);
    try {
      if (role === 'provider') {
        await endVisit();
      }
    } catch {
      /* ignore */
    }
    try {
      onVisitEnd?.();
    } catch {
      /* ignore */
    }
  }

  if (status === 'idle' || status === 'connecting') {
    return (
      <Center p="xl" style={{ height: '100%' }}>
        <Stack align="center" gap="sm">
          <Loader size="lg" />
          <Text c="dimmed">Connecting to video…</Text>
        </Stack>
      </Center>
    );
  }

  if (status === 'error') {
    return (
      <Center p="xl" style={{ height: '100%' }}>
        <Stack align="center" gap="sm">
          <Text c="red" fw={600}>
            Connection Error
          </Text>
          <Text size="sm" c="dimmed">
            {error}
          </Text>
          <Button
            size="sm"
            variant="light"
            onClick={() => {
              joinedRef.current = false;
              joinRoom(role).catch(() => undefined);
            }}
          >
            Retry
          </Button>
        </Stack>
      </Center>
    );
  }

  if (!token || !livekitHost) {
    return null;
  }

  return (
    <div style={{ height: '100%', minHeight: 400, background: '#101113' }}>
      <LiveKitRoom
        serverUrl={livekitHost}
        token={token}
        connect={true}
        video={videoCapture}
        audio={audioCapture}
        options={roomOptions}
        style={{ height: '100%' }}
      >
        <PerformanceOptimizer />
        <KeyboardShortcuts />
        <RoomCleanup />
        <MeetLayout
          role={role}
          onEnd={handleEnd}
          ended={Boolean(encounterEnded || localEnded)}
          onDismissEnd={onDismissEnd}
          onFeedback={onFeedback}
        />
        <RoomAudioRenderer />
      </LiveKitRoom>
    </div>
  );
}

/**
 * Ensures all local media tracks are stopped when the component tree
 * unmounts or the browser tab is closed. Without this, the camera/mic
 * indicator can stay on even after the window is closed.
 *
 * @returns Nothing (side-effect only).
 */
function RoomCleanup(): null {
  const room = useRoomContext();

  useEffect(() => {
    const stopTracks = (): void => {
      try {
        room.localParticipant.trackPublications.forEach((pub) => {
          pub.track?.stop();
        });
        Promise.resolve(room.disconnect(true)).catch(() => undefined);
      } catch {
        /* ignore — room may already be disconnected */
      }
    };

    globalThis.addEventListener('beforeunload', stopTracks);
    return () => {
      globalThis.removeEventListener('beforeunload', stopTracks);
      stopTracks();
    };
  }, [room]);

  return null;
}
