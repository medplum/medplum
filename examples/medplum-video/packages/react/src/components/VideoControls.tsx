// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import React from 'react';
import { ControlBar } from '@livekit/components-react';

export interface VideoControlsProps {
  role: 'provider' | 'patient' | 'observer';
}

/**
 * Wraps LiveKit's ControlBar with role-based permissions.
 *
 * - Providers: camera, microphone, screen share
 * - Patients: camera, microphone (no screen share)
 * - Observers: no controls (view-only)
 *
 * @param props - The video controls component props.
 * @param props.role - The participant role determining available controls.
 * @returns A React element rendering the role-appropriate control bar.
 */
export function VideoControls({ role }: VideoControlsProps): React.JSX.Element {
  return (
    <ControlBar
      controls={{
        camera: role !== 'observer',
        microphone: role !== 'observer',
        screenShare: role === 'provider',
        settings: role !== 'observer',
      }}
    />
  );
}
