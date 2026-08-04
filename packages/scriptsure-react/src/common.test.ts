// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, test } from 'vitest';
import { SCRIPTSURE_GCN_SEQNO_SYSTEM } from './common';

describe('common identifier systems', () => {
  // The GCN_SEQNO coding stamped on a draft MedicationRequest (via this constant)
  // is matched by the medplum-ee prescription webhook bot to reconcile draft->sent
  // prescriptions. The bot hard-codes the same literal in
  // medplum-ee/packages/scriptsure/src/common/utils.ts; if the two ever drift the
  // reconciliation silently no-ops. Pin the value so a rename can't do that quietly.
  test('SCRIPTSURE_GCN_SEQNO_SYSTEM matches the medplum-ee bot literal', () => {
    expect(SCRIPTSURE_GCN_SEQNO_SYSTEM).toBe('https://scriptsure.com/gcn-seqno');
  });
});
