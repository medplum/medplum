// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

// start-block lifecycleHooks
import type { Bundle } from '@medplum/fhirtypes';
import { useMedplum, useSubscription } from '@medplum/react-hooks';
import type { ReactNode } from 'react';
import { useCallback, useState } from 'react';

function LiveChatComponent(): ReactNode {
  const medplum = useMedplum();
  const [isConnected, setIsConnected] = useState(true);

  useSubscription(
    'Communication',
    (_bundle: Bundle) => {
      // Handle incoming messages in real-time
    },
    {
      // Show connection status
      onWebSocketOpen: useCallback(() => {
        setIsConnected(true);
      }, []),

      onWebSocketClose: useCallback(() => {
        setIsConnected(false);
      }, []),

      // Refresh chat state when subscription reconnects
      onSubscriptionConnect: useCallback(() => {
        medplum.searchResources('Communication', { _sort: '-_lastUpdated' });
      }, [medplum]),
    }
  );

  return (
    <div>
      <div>{isConnected ? '🟢 Connected' : '🔴 Disconnected'}</div>
    </div>
  );
}
// end-block lifecycleHooks

export { LiveChatComponent };
