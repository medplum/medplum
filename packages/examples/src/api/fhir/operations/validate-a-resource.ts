// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MedplumClient } from '@medplum/core';

const medplum = new MedplumClient();

// start-block validate
const result = await medplum.validateResource({
  resourceType: 'Patient',
  name: [{ given: ['Alice'], family: 'Smith' }],
});
// end-block validate

console.log(result);
