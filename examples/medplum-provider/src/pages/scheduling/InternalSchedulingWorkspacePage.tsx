// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { SchedulingWorkspace } from '@medplum/react-scheduling';
import type { JSX } from 'react';

// Canonical urls, seeded by `candid-scheduling`'s `install-bots.ts` (`ensureProcedureAndDiagnosisValueSets` /
// `ensureCancellationReasonValueSet`) -- the OneOncology-specific CPT/HCPCS, ICD-10-CM, and cancellation-reason
// ValueSets, not the full (and unpopulated, in this project) AMA CPT / HL7 ICD-10-CM defaults
// `SchedulingWorkspace` falls back to when these props are omitted. Keep in sync with that file if it changes.
const PROCEDURE_CODE_VALUE_SET_URL = 'https://www.medplum.com/candid-scheduling/oneoncology-procedure-codes-vs';
const DIAGNOSIS_CODE_VALUE_SET_URL = 'https://www.medplum.com/candid-scheduling/oneoncology-diagnosis-codes-vs';
const CANCELLATION_REASON_VALUE_SET_URL = 'https://www.medplum.com/candid-scheduling/oneoncology-cancellation-reason-vs';

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
      <SchedulingWorkspace
        procedureBinding={PROCEDURE_CODE_VALUE_SET_URL}
        diagnosisBinding={DIAGNOSIS_CODE_VALUE_SET_URL}
        appointmentCancellationReasonValueSet={CANCELLATION_REASON_VALUE_SET_URL}
        canBypassSchedulingRules
      />
    </div>
  );
}
