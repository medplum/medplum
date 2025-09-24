// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { CompositionEvent } from '@medplum/fhirtypes';
import { mapCodeableConceptToCcdaCode } from '../systems';
import { CcdaDocumentationOf } from '../types';
import { mapEffectiveDate } from './utils';

export function mapDocumentationOf(events: CompositionEvent[] | undefined): CcdaDocumentationOf | undefined {
  if (!events || events.length === 0) {
    return undefined;
  }

  const event = events[0];
  if (!event || (!event.code && !event.period)) {
    return undefined;
  }

  return {
    serviceEvent: {
      '@_classCode': 'PCPR',
      code: mapCodeableConceptToCcdaCode(event.code?.[0]),
      effectiveTime: mapEffectiveDate(undefined, event.period),
    },
  };
}
