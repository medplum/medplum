// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Coding } from '@medplum/fhirtypes';

/** Created by src/scripts/deploy-bots.ts and applied to patients by the generate-magic-link bot */
export const SIGNER_ACCESS_POLICY_NAME = 'Preauth Demo Signer';

/** Tags the demo Patient and Questionnaire so the app can find and reuse them */
export const DEMO_TAG: Coding = {
  system: 'https://medplum.com/tags',
  code: 'preauth-demo',
  display: 'Pre-Authorized Code Demo',
};
