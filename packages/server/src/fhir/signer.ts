import { Binary } from '@medplum/fhirtypes';
import { getConfig } from '../config';
import { getSignedUrl } from "@aws-sdk/cloudfront-signer";

/**
 * Creates a signed URL for a given URL.
 *
 * Reference:
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/modules/_aws_sdk_cloudfront_signer.html
 */
export class Signer {
  readonly #keyPairId: string;
  readonly #privateKey: string;
  readonly #passphrase: string;

  constructor(keyPairId: string, privateKey: string, passphrase: string) {
    this.#keyPairId = keyPairId;
    this.#privateKey = privateKey;
    this.#passphrase = passphrase;
  }

  /**
   * Creates a signed URL.
   * @param url Input URL.
   * @param dateLessThan The date for when the signed URL can no longer be accessed. Default is one hour in the future
   * @returns Presigned URL.
   */
  sign(url: string, dateLessThan?: Date): string {

    if (!dateLessThan) {
      dateLessThan = new Date();
      dateLessThan.setHours(dateLessThan.getHours() + 1);
    }

    return getSignedUrl({
      url,
      keyPairId: this.#keyPairId,
      dateLessThan: dateLessThan.toISOString(),
      privateKey: this.#privateKey,
      passphrase: this.#passphrase,
    })
  }
}

/**
 * Returns a presigned URL for the Binary resource content.
 * @param binary Binary resource.
 * @returns Presigned URL to access the binary data.
 */
export function getPresignedUrl(binary: Binary): string {
  const config = getConfig();
  const storageBaseUrl = config.storageBaseUrl;
  const unsignedUrl = `${storageBaseUrl}${binary.id}/${binary.meta?.versionId}`;
  const signer = new Signer(config.signingKeyId, config.signingKey, config.signingKeyPassphrase);

  return signer.sign(unsignedUrl);
}
