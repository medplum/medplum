import { concatUrls } from '@medplum/core';
import { Binary } from '@medplum/fhirtypes';
import { createSign } from 'crypto';
import { getConfig } from '../config/loader';

/**
 * Generates a presigned URL for a Binary resource.
 * This URL can be used to access the binary data securely.
 * This presigned URL is only valid when using the built-in storage handler.
 * @param binary - The Binary resource to generate a presigned URL for.
 * @returns The presigned URL as a string.
 */
export async function generatePresignedUrl(binary: Binary): Promise<string> {
  const config = getConfig();
  const storageBaseUrl = config.storageBaseUrl;
  const result = new URL(concatUrls(storageBaseUrl, `${binary.id}/${binary.meta?.versionId}`));

  const dateLessThan = new Date();
  dateLessThan.setHours(dateLessThan.getHours() + 1);
  result.searchParams.set('Expires', Math.floor(dateLessThan.getTime() / 1000).toString());

  if (config.signingKey) {
    const privateKey = { key: config.signingKey, passphrase: config.signingKeyPassphrase };
    const signature = createSign('sha256').update(result.toString()).sign(privateKey, 'base64');
    result.searchParams.set('Signature', signature);
  }

  return result.toString();
}
