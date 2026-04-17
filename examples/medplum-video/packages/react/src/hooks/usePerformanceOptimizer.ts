// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type {
  LocalTrackPublication,
  LocalVideoTrack,
  RemoteTrack,
  RemoteTrackPublication,
  Room,
} from 'livekit-client';
import {
  isVideoTrack,
  ParticipantEvent,
  RoomEvent,
  VideoQuality,
} from 'livekit-client';
import { useEffect, useMemo, useState } from 'react';

export interface PerformanceOptimizerOptions {
  readonly reducePublisherVideoQuality?: boolean;
  readonly reduceSubscriberVideoQuality?: boolean;
  readonly disableVideoProcessing?: boolean;
}

const defaultOptions: Required<PerformanceOptimizerOptions> = {
  reducePublisherVideoQuality: true,
  reduceSubscriberVideoQuality: true,
  disableVideoProcessing: false,
};

/**
 * Reduces capture/subscribe quality when the local CPU is constrained (similar to LiveKit Meet).
 *
 * @param room - Connected LiveKit room instance.
 * @param options - Tuning flags for publisher/subscriber behavior.
 * @returns Whether low-power (CPU constrained) mode is active.
 */
export function usePerformanceOptimizer(room: Room, options: PerformanceOptimizerOptions = {}): boolean {
  const [lowPowerMode, setLowPowerMode] = useState(false);
  const opts = useMemo(() => ({ ...defaultOptions, ...options }), [options]);

  useEffect(() => {
    const handleCpuConstrained = (track: LocalVideoTrack, _publication: LocalTrackPublication): void => {
      setLowPowerMode(true);
      if (opts.reducePublisherVideoQuality) {
        Promise.resolve(track.prioritizePerformance()).catch(() => undefined);
      }
      if (opts.disableVideoProcessing && isVideoTrack(track)) {
        Promise.resolve(track.stopProcessor()).catch(() => undefined);
      }
      if (opts.reduceSubscriberVideoQuality) {
        room.remoteParticipants.forEach((participant) => {
          participant.videoTrackPublications.forEach((publication) => {
            publication.setVideoQuality(VideoQuality.LOW);
          });
        });
      }
    };

    room.localParticipant.on(ParticipantEvent.LocalTrackCpuConstrained, handleCpuConstrained);
    return () => {
      room.localParticipant.off(ParticipantEvent.LocalTrackCpuConstrained, handleCpuConstrained);
    };
  }, [room, opts.disableVideoProcessing, opts.reducePublisherVideoQuality, opts.reduceSubscriberVideoQuality]);

  useEffect(() => {
    const lowerQuality = (_track: RemoteTrack, publication: RemoteTrackPublication): void => {
      publication.setVideoQuality(VideoQuality.LOW);
    };
    if (lowPowerMode && opts.reduceSubscriberVideoQuality) {
      room.on(RoomEvent.TrackSubscribed, lowerQuality);
    }

    return () => {
      room.off(RoomEvent.TrackSubscribed, lowerQuality);
    };
  }, [lowPowerMode, room, opts.reduceSubscriberVideoQuality]);

  return lowPowerMode;
}
