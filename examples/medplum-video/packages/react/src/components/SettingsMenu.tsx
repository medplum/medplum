// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import React from 'react';
import { MediaDeviceMenu, useMaybeLayoutContext } from '@livekit/components-react';
import { supportsAudioOutputSelection } from 'livekit-client';

import styles from './SettingsMenu.module.css';
import { CameraSettings } from './CameraSettings';
import { MicrophoneSettings } from './MicrophoneSettings';

export interface SettingsMenuProps extends React.HTMLAttributes<HTMLDivElement> {}

/**
 * In-call settings panel: camera, microphone, and speaker/output selection.
 * Intended for use as `SettingsComponent` on the `VideoConference` prefab from LiveKit.
 *
 * @param props - HTML div attributes.
 * @param props.className - Optional CSS class for the root element.
 * @returns The settings panel UI.
 */
export function SettingsMenu({ className, ...props }: SettingsMenuProps): React.JSX.Element {
  const layoutContext = useMaybeLayoutContext();
  const showSpeaker = typeof globalThis !== 'undefined' && supportsAudioOutputSelection();

  return (
    <div {...props} className={className} style={{ padding: '0.75rem', ...props.style }}>
      <div className={styles.tabs} role="tablist">
        <button type="button" className={styles.tab} aria-pressed={true} role="tab">
          Media devices
        </button>
      </div>

      <div className={styles.panel}>
        <CameraSettings />
        <MicrophoneSettings />

        {showSpeaker && (
          <section>
            <h3 style={{ fontSize: '0.875rem', fontWeight: 600, margin: '0 0 0.5rem' }}>
              Speaker &amp; headphones
            </h3>
            <p style={{ fontSize: '0.75rem', opacity: 0.75, margin: '0 0 0.5rem' }}>Audio output</p>
            <span className="lk-button-group">
              <span className="lk-button-group-menu">
                <MediaDeviceMenu kind="audiooutput" />
              </span>
            </span>
          </section>
        )}
      </div>

      <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'flex-end' }}>
        <button
          type="button"
          className="lk-button"
          onClick={() => layoutContext?.widget.dispatch?.({ msg: 'toggle_settings' })}
        >
          Close
        </button>
      </div>
    </div>
  );
}
