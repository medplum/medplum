// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { DescribeImagesCommand, ECRClient } from '@aws-sdk/client-ecr';
import type { MedplumInfraConfig } from '@medplum/core';
import { mockClient } from 'aws-sdk-client-mock';
import type { MockInstance } from 'vitest';
import { resolveImageDigest, resolveImageDigests } from './images';

const DIGEST = 'sha256:a3ed4dd54a141f1068831a8a1c6144db1d07261204d39afd1b14be883ff00501';
const ECR_IMAGE = '647991932601.dkr.ecr.us-east-1.amazonaws.com/medplum/otel-collector';

describe('Image digests', () => {
  const ecrMock = mockClient(ECRClient);
  let fetchMock: MockInstance<typeof fetch>;

  beforeEach(() => {
    console.log = vi.fn();
    ecrMock.reset();
    ecrMock
      .on(DescribeImagesCommand, {
        registryId: '647991932601',
        repositoryName: 'medplum/otel-collector',
        imageIds: [{ imageTag: 'latest' }],
      })
      .resolves({ imageDetails: [{ imageDigest: DIGEST }] });

    // Docker Hub: anonymous HEAD is challenged, then succeeds with a token
    fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = input instanceof Request ? input.url : input.toString();
      if (url.startsWith('https://auth.docker.io/token')) {
        return Response.json({ token: 'anon-token' });
      }
      if (url === 'https://registry-1.docker.io/v2/medplum/medplum-server/manifests/latest') {
        const headers = new Headers(init?.headers);
        return headers.get('authorization') === 'Bearer anon-token'
          ? new Response(null, { headers: { 'docker-content-digest': DIGEST } })
          : new Response(null, {
              status: 401,
              headers: {
                'www-authenticate':
                  'Bearer realm="https://auth.docker.io/token",service="registry.docker.io",scope="repository:medplum/medplum-server:pull"',
              },
            });
      }
      return new Response(null, { status: 404 });
    });
  });

  afterEach(() => {
    fetchMock.mockRestore();
  });

  test('ECR tag', async () => {
    await expect(resolveImageDigest(`${ECR_IMAGE}:latest`)).resolves.toBe(`${ECR_IMAGE}@${DIGEST}`);
  });

  test('Docker Hub tag pins the multi-platform index', async () => {
    await expect(resolveImageDigest('medplum/medplum-server:latest')).resolves.toBe(`medplum/medplum-server@${DIGEST}`);
    expect(fetchMock).toHaveBeenCalledWith(
      new URL(
        'https://auth.docker.io/token?service=registry.docker.io&scope=repository%3Amedplum%2Fmedplum-server%3Apull'
      )
    );
    const accept = new Headers(fetchMock.mock.calls[0][1]?.headers).get('accept');
    expect(accept?.startsWith('application/vnd.oci.image.index.v1+json')).toBe(true);
  });

  test('Unknown tag throws', async () => {
    await expect(resolveImageDigest('medplum/medplum-server:missing')).rejects.toThrow('HTTP 404');
  });

  test('Pins each additional container image once and leaves server images as tags', async () => {
    const config = {
      serverImage: 'medplum/medplum-server:latest',
      additionalContainers: [{ name: 'otel', image: `${ECR_IMAGE}:latest` }],
      workerServices: [
        {
          id: 'Workers',
          desiredCount: 1,
          serverImage: 'medplum/medplum-server:latest',
          additionalContainers: [
            { name: 'otel', image: `${ECR_IMAGE}:latest` },
            { name: 'pinned', image: `busybox@${DIGEST}` },
          ],
        },
      ],
    } as MedplumInfraConfig;

    await resolveImageDigests(config);

    expect(config.serverImage).toBe('medplum/medplum-server:latest');
    expect(config.additionalContainers?.[0].image).toBe(`${ECR_IMAGE}@${DIGEST}`);
    expect(config.workerServices?.[0].serverImage).toBe('medplum/medplum-server:latest');
    expect(config.workerServices?.[0].additionalContainers?.[0].image).toBe(`${ECR_IMAGE}@${DIGEST}`);
    expect(config.workerServices?.[0].additionalContainers?.[1].image).toBe(`busybox@${DIGEST}`);
    expect(ecrMock.commandCalls(DescribeImagesCommand)).toHaveLength(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
