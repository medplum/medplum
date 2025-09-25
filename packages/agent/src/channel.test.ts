// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ContentType } from '@medplum/core';
import { Endpoint } from '@medplum/fhirtypes';
import { getChannelTypeShortName } from './channel';

describe('Channel', () => {
  describe('getChannelTypeShortName', () => {
    test.each([
      {
        address: 'mllp://0.0.0.0:9001',
        shortName: 'HL7',
        endpoint: {
          resourceType: 'Endpoint',
          address: 'mllp://0.0.0.0:9001',
          status: 'active',
          connectionType: { code: ContentType.HL7_V2 },
          payloadType: [{ coding: [{ code: ContentType.HL7_V2 }] }],
        },
      },
      {
        address: 'dicom://0.0.0.0:9001',
        shortName: 'DICOM',
        endpoint: {
          resourceType: 'Endpoint',
          address: 'dicom://0.0.0.0:9001',
          status: 'active',
          connectionType: { code: ContentType.DICOM },
          payloadType: [{ coding: [{ code: ContentType.DICOM }] }],
        },
      },
      {
        address: 'tcp://0.0.0.0:9001',
        shortName: 'Byte Stream',
        endpoint: {
          resourceType: 'Endpoint',
          address: 'tcp://0.0.0.0:9001',
          status: 'active',
          connectionType: { code: ContentType.OCTET_STREAM },
          payloadType: [{ coding: [{ code: ContentType.OCTET_STREAM }] }],
        },
      },
    ] as { endpoint: Endpoint; shortName: string; address: string }[])(
      'getChannelTypeShortName({ "resourceType": "Endpoint", "address": "$address" }) = $shortName',
      ({ endpoint, shortName }) => {
        expect(getChannelTypeShortName(endpoint)).toStrictEqual(shortName);
      }
    );
  });

  test('should throw on unknown endpoint type', () => {
    const endpoint: Endpoint = {
      resourceType: 'Endpoint',
      address: 'serial://0.0.0.0:9001',
      status: 'active',
      connectionType: { code: ContentType.OCTET_STREAM },
      payloadType: [{ coding: [{ code: ContentType.OCTET_STREAM }] }],
    };
    expect(() => getChannelTypeShortName(endpoint)).toThrow(`Invalid endpoint type with address '${endpoint.address}'`);
  });
});
