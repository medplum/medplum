import { Binary } from '@medplum/core';
import crypto from 'crypto';
import { getConfig } from '../config';

/**
 * Creates a signed URL for a given URL.
 * 
 * Unfortunately, the AWS JS SDK does not include this feature, so we do it manually.
 * Hopefully this will be fixed in the future.
 * 
 * Reference:
 * https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-creating-signed-url-canned-policy.html
 */
export class Signer {
  constructor(
    private readonly keyPairId: string,
    private readonly privateKey: string,
    private readonly passphrase: string) { }

  /**
   * Creates a signed URL.
   * @param url Input URL.
   * @param expires Date and time in Unix time format (in seconds) and Coordinated Universal Time (UTC)
   * @returns Presigned URL.
   */
  sign(url: string, expires?: number): string {
    if (!expires) {
      // Default to one hour in the future
      expires = Math.floor(new Date().getTime() / 1000) + 3600;
    }

    const policy = {
      'Statement': [{
        'Resource': url,
        'Condition': {
          'DateLessThan': {
            'AWS:EpochTime': expires
          }
        }
      }]
    };

    const result = new URL(url);
    result.searchParams.set('Expires', expires.toString());
    result.searchParams.set('Key-Pair-Id', this.keyPairId);
    result.searchParams.set('Signature', this.signPolicy(policy));
    return result.toString();
  }

  private signPolicy(policy: any): string {
    const sign = crypto.createSign('RSA-SHA1');
    sign.write(JSON.stringify(policy));
    return this.queryEncode(sign.sign({ key: this.privateKey, passphrase: this.passphrase }, 'base64'));
  }

  /**
   * Create a URL safe Base64 encoded string.
   *
   * This function will replace all characters that are invalid in a URL query
   * string with characters that are. AWS will translate these characters back to
   * their original value before processing.
   *
   * For more information, see
   * http://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-creating-signed-url-canned-policy.html
   */
  private queryEncode(str: string): string {
    return str
      .replace(/\+/g, '-')
      .replace(/=/g, '_')
      .replace(/\//g, '~');
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
  const signer = new Signer(
    config.signingKeyId,
    config.signingKey,
    config.signingKeyPassphrase);

  return signer.sign(unsignedUrl);
}
