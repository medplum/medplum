// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ContentType, TypedEventTarget } from '@medplum/core';
import type { Endpoint } from '@medplum/fhirtypes';
import type { App } from './app';
import { getChannelTypeShortName } from './channel';
import { AgentHl7Channel } from './hl7';
import { createMockLogger } from './test-utils';

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

describe('BaseChannel.validateConfig', () => {
  // The rules live in one place per channel -- the static -- and the instance method is a
  // convenience over it, so a live channel can never validate differently from the planner.
  test('Delegates to the concrete channel class static', () => {
    const definition = { name: 'hl7', endpoint: { reference: 'Endpoint/hl7' } };
    const endpoint: Endpoint = {
      resourceType: 'Endpoint',
      status: 'active',
      address: 'mllp://0.0.0.0:9001?enhanced=bogus',
      connectionType: { code: ContentType.HL7_V2 },
      payloadType: [{ coding: [{ code: ContentType.HL7_V2 }] }],
    };
    const context = { retryDefaults: {}, durableQueueOn: false };

    const channel = new AgentHl7Channel(
      {
        log: createMockLogger(),
        channelLog: createMockLogger(),
        heartbeatEmitter: new TypedEventTarget(),
      } as unknown as App,
      definition,
      endpoint
    );
    const spy = vi.spyOn(AgentHl7Channel, 'validateConfig');

    const issues = channel.validateConfig(definition, endpoint, context);

    expect(spy).toHaveBeenCalledWith(definition, endpoint, context);
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toContain("Invalid enhanced value 'bogus'");
    spy.mockRestore();
  });
});
