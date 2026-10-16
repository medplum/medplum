// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { DescribeImagesCommand, ECRClient } from '@aws-sdk/client-ecr';
import type { MedplumInfraConfig } from '@medplum/core';

const ECR_HOST = /^(\d{12})\.dkr\.ecr\.([a-z0-9-]+)\.amazonaws\.com$/;
const DIGEST = /^sha256:[0-9a-f]{64}$/;

// Index types first: a multi-platform tag must pin the index, not whichever platform the registry would pick
const MANIFEST_ACCEPT = [
  'application/vnd.oci.image.index.v1+json',
  'application/vnd.docker.distribution.manifest.list.v2+json',
  'application/vnd.oci.image.manifest.v1+json',
  'application/vnd.docker.distribution.manifest.v2+json',
].join(', ');

const ecrClients: Record<string, ECRClient> = {};

/**
 * Replaces each tagged additional container image in the config with `<name>@<digest>` of the image the tag currently
 * points to. Server images are left as tags: the server deploy pipeline pins its own digests outside CDK, so pinning
 * them here would only show up as diffs against the deployed template.
 * @param config - The infra config, modified in place.
 */
export async function resolveImageDigests(config: MedplumInfraConfig): Promise<void> {
  const resolved = new Map<string, Promise<string>>();
  const pin = (image: string): Promise<string> => {
    let digestImage = resolved.get(image);
    if (!digestImage) {
      digestImage = resolveImageDigest(image);
      resolved.set(image, digestImage);
    }
    return digestImage;
  };

  for (const container of config.additionalContainers ?? []) {
    container.image = await pin(container.image);
  }
  for (const service of config.workerServices ?? []) {
    for (const container of service.additionalContainers ?? []) {
      container.image = await pin(container.image);
    }
  }
}

/**
 * Resolves an image reference to `<name>@<digest>`. References that already carry a digest are returned unchanged.
 * @param image - The image reference, e.g. `medplum/medplum-server:latest`.
 * @returns The digest-pinned image reference.
 */
export async function resolveImageDigest(image: string): Promise<string> {
  if (image.includes('@')) {
    return image;
  }
  const { name, host, repository, tag } = parseImageReference(image);
  const ecr = ECR_HOST.exec(host);
  const digest = ecr
    ? await fetchEcrDigest(ecr[1], ecr[2], repository, tag)
    : await fetchRegistryDigest(host, repository, tag);
  if (!digest || !DIGEST.test(digest)) {
    throw new Error(`Could not resolve a digest for image ${image}`);
  }
  console.log(`Pinned ${image} to ${digest}`);
  return `${name}@${digest}`;
}

function parseImageReference(image: string): { name: string; host: string; repository: string; tag: string } {
  const tagIndex = image.lastIndexOf(':');
  const hasTag = tagIndex > image.lastIndexOf('/');
  const name = hasTag ? image.slice(0, tagIndex) : image;
  const tag = hasTag ? image.slice(tagIndex + 1) : 'latest';

  // Per the Docker reference grammar, the first path component is a registry host only if it looks like one
  const slashIndex = name.indexOf('/');
  const first = name.slice(0, slashIndex);
  if (slashIndex !== -1 && (first.includes('.') || first.includes(':') || first === 'localhost')) {
    const host = first === 'docker.io' ? 'registry-1.docker.io' : first;
    return { name, host, repository: name.slice(slashIndex + 1), tag };
  }
  return { name, host: 'registry-1.docker.io', repository: slashIndex === -1 ? `library/${name}` : name, tag };
}

async function fetchEcrDigest(
  registryId: string,
  region: string,
  repositoryName: string,
  imageTag: string
): Promise<string | undefined> {
  ecrClients[region] ??= new ECRClient({ region });
  const result = await ecrClients[region].send(
    new DescribeImagesCommand({ registryId, repositoryName, imageIds: [{ imageTag }] })
  );
  return result.imageDetails?.[0]?.imageDigest;
}

async function fetchRegistryDigest(host: string, repository: string, tag: string): Promise<string | undefined> {
  const url = `https://${host}/v2/${repository}/manifests/${tag}`;
  const headers: Record<string, string> = { Accept: MANIFEST_ACCEPT };
  let response = await fetch(url, { method: 'HEAD', headers });
  if (response.status === 401) {
    headers.Authorization = `Bearer ${await fetchRegistryToken(response.headers.get('www-authenticate'))}`;
    response = await fetch(url, { method: 'HEAD', headers });
  }
  if (!response.ok) {
    throw new Error(`Failed to resolve ${host}/${repository}:${tag}: HTTP ${response.status}`);
  }
  return response.headers.get('docker-content-digest') ?? undefined;
}

/**
 * Fetches an anonymous token for a registry's Bearer challenge (e.g. Docker Hub's `auth.docker.io`).
 * @param challenge - The `WWW-Authenticate` header of the unauthorized response.
 * @returns The bearer token.
 */
async function fetchRegistryToken(challenge: string | null): Promise<string> {
  const params = Object.fromEntries(Array.from((challenge ?? '').matchAll(/(\w+)="([^"]*)"/g), ([, k, v]) => [k, v]));
  if (!challenge?.startsWith('Bearer ') || !params.realm) {
    throw new Error(`Unsupported registry auth challenge: ${challenge}`);
  }
  const url = new URL(params.realm);
  for (const key of ['service', 'scope']) {
    if (params[key]) {
      url.searchParams.set(key, params[key]);
    }
  }
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch registry token from ${url.origin}: HTTP ${response.status}`);
  }
  const body = (await response.json()) as { token?: string; access_token?: string };
  const token = body.token ?? body.access_token;
  if (!token) {
    throw new Error(`Registry token response from ${url.origin} had no token`);
  }
  return token;
}
