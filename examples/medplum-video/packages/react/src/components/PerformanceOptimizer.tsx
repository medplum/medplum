// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { useRoomContext } from '@livekit/components-react';

import { usePerformanceOptimizer } from '../hooks/usePerformanceOptimizer';

/**
 * Subscribes to CPU constraint signals on the current room and lowers quality when needed.
 *
 * @returns Nothing (side-effect only).
 */
export function PerformanceOptimizer(): null {
  const room = useRoomContext();
  usePerformanceOptimizer(room);
  return null;
}
