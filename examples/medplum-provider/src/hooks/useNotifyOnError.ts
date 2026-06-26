// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { isOk } from '@medplum/core';
import type { OperationOutcome } from '@medplum/fhirtypes';
import { useEffect } from 'react';
import { showErrorNotification } from '../utils/notifications';

export function useNotifyOnError(outcome?: OperationOutcome): void {
  useEffect(() => {
    if (outcome && !isOk(outcome)) {
      showErrorNotification(outcome);
    }
  }, [outcome]);
}
