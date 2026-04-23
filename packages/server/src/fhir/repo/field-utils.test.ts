// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { toTypedValue } from '@medplum/core';
import type { Patient } from '@medplum/fhirtypes';
import { setTypedPropertyValue } from '../repo';

describe('Repository field utils', () => {
  test('setTypedPropertyValue', () => {
    const patient: Patient = {
      resourceType: 'Patient',
      photo: [
        {
          contentType: 'image/png',
          url: 'https://example.com/photo.png',
        },
        {
          contentType: 'image/png',
          data: 'base64data',
        },
      ],
    };

    setTypedPropertyValue(toTypedValue(patient), 'photo[1].contentType', { type: 'string', value: 'image/jpeg' });
    expect(patient.photo?.[1].contentType).toStrictEqual('image/jpeg');
  });
});
