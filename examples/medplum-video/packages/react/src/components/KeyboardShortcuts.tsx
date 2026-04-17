// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import React from 'react';
import { useTrackToggle } from '@livekit/components-react';
import { Track } from 'livekit-client';

/**
 * Global shortcuts while in a LiveKit room:
 * - Cmd/Ctrl+Shift+A: toggle microphone
 * - Cmd/Ctrl+Shift+V: toggle camera
 *
 * @returns Nothing (side-effect only).
 */
export function KeyboardShortcuts(): null {
  const { toggle: toggleMic } = useTrackToggle({ source: Track.Source.Microphone });
  const { toggle: toggleCamera } = useTrackToggle({ source: Track.Source.Camera });

  React.useEffect(() => {
    function handleShortcut(event: KeyboardEvent): void {
      const mod = event.ctrlKey || event.metaKey;
      if (!mod || !event.shiftKey) {
        return;
      }
      const key = event.key.toLowerCase();
      if (key === 'a' && toggleMic) {
        event.preventDefault();
        Promise.resolve(toggleMic()).catch(() => undefined);
      }
      if (key === 'v' && toggleCamera) {
        event.preventDefault();
        Promise.resolve(toggleCamera()).catch(() => undefined);
      }
    }

    globalThis.addEventListener('keydown', handleShortcut);
    return () => globalThis.removeEventListener('keydown', handleShortcut);
  }, [toggleMic, toggleCamera]);

  return null;
}
