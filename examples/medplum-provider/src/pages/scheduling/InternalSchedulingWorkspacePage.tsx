// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { SchedulingWorkspace } from '@medplum/react-scheduling';
import type { JSX } from 'react';

/**
 * Internal-only page for exercising `@medplum/react-scheduling`'s `SchedulingWorkspace` inside the
 * Provider app. Reachable only by navigating directly to its route — intentionally not linked from the
 * sidebar (the `menus` prop in `App.tsx`) or from any other page, since it's a scratch surface for
 * manual testing, not a feature offered to end users.
 * @returns A React component that renders the scheduling workspace test harness.
 */
export function InternalSchedulingWorkspacePage(): JSX.Element {
  return (
    <div style={{ height: '100dvh', padding: '1rem', boxSizing: 'border-box' }}>
      <SchedulingWorkspace />
    </div>
  );
}
