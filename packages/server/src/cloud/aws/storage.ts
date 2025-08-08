// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { CopyObjectCommand, GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/cloudfront-signer';
import { Upload } from '@aws-sdk/lib-storage';
import { getSignedUrl as s3GetSignedUrl } from '@aws-sdk/s3-request-presigner';
import { concatUrls } from '@medplum/core';
import { Binary } from '@medplum/fhirtypes';
import { Readable } from 'stream';
import { getConfig } from '../../config/loader';
import { BaseBinaryStorage } from '../../storage/base';
import { BinarySource } from '../../storage/types';

/**
 * The S3Storage class stores binary data in an AWS S3 bucket.
 * Files are stored in bucket/binary/binary.id/binary.meta.versionId.
 */
export class S3Storage extends BaseBinaryStorage {
  private readonly client: S3Client;
  readonly bucket: string;

  constructor(bucket: string) {
    super();
    this.client = new S3Client({ region: getConfig().awsRegion });
    this.bucket = bucket;
  }

  /**
   * Writes a file to S3.
   *
   * Early implementations used the simple "PutObjectCommand" to write the blob to S3.
   * However, PutObjectCommand does not support streaming.
   *
   * We now use the @aws-sdk/lib-storage package.
   *
   * Learn more:
   * https://github.com/aws/aws-sdk-js-v3/blob/main/UPGRADING.md#s3-multipart-upload
   * https://github.com/aws/aws-sdk-js-v3/tree/main/lib/lib-storage
   *
   * Be mindful of Cache-Control settings.
   *
   * Because we use signed URLs intended for one hour use,
   * we set "max-age" to 1 hour = 3600 seconds.
   *
   * But we want CloudFront to cache the response for 1 day,
   * so we set "s-maxage" to 1 day = 86400 seconds.
   *
   * Learn more:
   * https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/Expiration.html
   * @param key - The S3 key.
   * @param contentType - Optional binary content type.
   * @param stream - The Node.js stream of readable content.
   */
  async writeFile(key: string, contentType: string | undefined, stream: BinarySource): Promise<void> {
    const upload = new Upload({
      params: {
        Bucket: this.bucket,
        Key: key,
        CacheControl: 'max-age=3600, s-maxage=86400',
        ContentType: contentType ?? 'application/octet-stream',
        Body: stream,
      },
      client: this.client,
      queueSize: 3,
    });

    await upload.done();
  }

  async readFile(key: string): Promise<Readable> {
    const output = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      })
    );
    return output.Body as Readable;
  }

  async copyFile(sourceKey: string, destinationKey: string): Promise<void> {
    await this.client.send(
      new CopyObjectCommand({
        CopySource: `${this.bucket}/${sourceKey}`,
        Bucket: this.bucket,
        Key: destinationKey,
      })
    );
  }

  /**
   * Returns a presigned URL for the Binary resource content.
   *
   * Reference:
   * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/modules/_aws_sdk_cloudfront_signer.html
   *
   * @param binary - Binary resource.
   * @returns Presigned URL to access the binary data.
   */
  async getPresignedUrl(binary: Binary): Promise<string> {
    const config = getConfig();

    if (!config.signingKey || !config.signingKeyId) {
      const Key = this.getKey(binary);
      return s3GetSignedUrl(this.client, new GetObjectCommand({ Bucket: this.bucket, Key }), { expiresIn: 3600 });
    }

    const storageBaseUrl = config.storageBaseUrl;
    const unsignedUrl = concatUrls(storageBaseUrl, `${binary.id}/${binary.meta?.versionId}`);
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
}
