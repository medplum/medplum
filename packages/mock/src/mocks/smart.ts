// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ClientApplication } from '@medplum/fhirtypes';

export const ExampleSmartClientApplication: ClientApplication = {
  resourceType: 'ClientApplication',
  id: 'smart-client-app',
  name: 'Inferno Client',
  description: 'Client application used for Inferno ONC compliance testing',
  redirectUris: ['https://inferno.healthit.gov/suites/custom/smart/redirect'],
  launchUri: 'https://inferno.healthit.gov/suites/custom/smart/launch',
};
