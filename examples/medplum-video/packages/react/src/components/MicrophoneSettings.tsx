// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import React from 'react';
import { MediaDeviceMenu, TrackToggle } from '@livekit/components-react';
import { Track } from 'livekit-client';

/**
 * Microphone device controls (mute + input device selection).
 * Krisp noise cancellation can be added when using LiveKit Cloud with `@livekit/krisp-noise-filter`.
 *
 * @returns The microphone settings panel.
 */
export function MicrophoneSettings(): React.JSX.Element {
  return (
    <section style={{ marginBottom: '1rem' }}>
      <h3 style={{ fontSize: '0.875rem', fontWeight: 600, margin: '0 0 0.5rem' }}>Microphone</h3>
      <span className="lk-button-group">
        <TrackToggle source={Track.Source.Microphone} />
        <span className="lk-button-group-menu">
          <MediaDeviceMenu kind="audioinput" />
        </span>
      </span>
    </section>
  );
}
