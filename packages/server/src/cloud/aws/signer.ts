import { getSignedUrl } from '@aws-sdk/cloudfront-signer';
import { Binary } from '@medplum/fhirtypes';
import { getConfig } from '../../config';

/**
 * Returns a presigned URL for the Binary resource content.
 *
 * Reference:
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/modules/_aws_sdk_cloudfront_signer.html
 * @param binary - Binary resource.
 * @returns Presigned URL to access the binary data.
 */
export function getPresignedUrl(binary: Binary): string {
  const config = getConfig();
  const storageBaseUrl = config.storageBaseUrl;
  const unsignedUrl = `${storageBaseUrl}${binary.id}/${binary.meta?.versionId}`;
  const dateLessThan = new Date();
  dateLessThan.setHours(dateLessThan.getHours() + 1);
  return getSignedUrl({
    url: unsignedUrl,
    keyPairId: config.signingKeyId,
    dateLessThan: dateLessThan.toISOString(),
    privateKey: config.signingKey,
    passphrase: config.signingKeyPassphrase,
  });
}
