// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Identifier } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import { useEffect, useState } from 'react';
import { showErrorNotification } from '../utils/notifications';

/**
 * Looks up one of the Candid integration bots by its identifier. Every Candid feature in the app is
 * optional: a project can have the payer directory deployed without provider registration, or no
 * Candid bots at all.
 * @param identifier - The bot's integration identifier; must be a stable reference.
 * @returns The bot ID, '' when the bot is not deployed, or undefined while loading.
 */
export function useCandidBot(identifier: Identifier): string | undefined {
  const medplum = useMedplum();
  const [botId, setBotId] = useState<string | undefined>(undefined);

  useEffect(() => {
    medplum
      .searchOne('Bot', { identifier: `${identifier.system}|${identifier.value}` })
      .then((bot) => setBotId(bot?.id ?? ''))
      .catch(showErrorNotification);
  }, [medplum, identifier]);

  return botId;
}
