// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { AwsClientStub } from 'aws-sdk-client-mock';
import { mockClient } from 'aws-sdk-client-mock';

/**
 * Creates an aws-sdk-client-mock stub for an AWS SDK client class.
 * aws-sdk-client-mock's generic Client parameter does not structurally match AWS SDK client classes under TypeScript 7.
 * @param client - The AWS SDK client class to mock.
 * @returns The mock stub for the client class.
 */
export function mockAwsClient(client: any): AwsClientStub<any> {
  return mockClient(client);
}
