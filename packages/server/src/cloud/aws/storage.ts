import { CopyObjectCommand, GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/cloudfront-signer';
import { Upload } from '@aws-sdk/lib-storage';
import { Binary } from '@medplum/fhirtypes';
import { Readable } from 'stream';
import { getConfig } from '../../config';
import { BinarySource, BinaryStorage, checkFileMetadata } from '../../fhir/storage';

/**
 * The S3Storage class stores binary data in an AWS S3 bucket.
 * Files are stored in bucket/binary/binary.id/binary.meta.versionId.
 */
export class S3Storage implements BinaryStorage {
  private readonly client: S3Client;
  readonly bucket: string;

  constructor(bucket: string) {
    this.client = new S3Client({ region: getConfig().awsRegion });
    this.bucket = bucket;
  }

  /**
   * Writes a binary blob to S3.
   * @param binary - The binary resource destination.
   * @param filename - Optional binary filename.
   * @param contentType - Optional binary content type.
   * @param stream - The Node.js stream of readable content.
   * @returns Promise that resolves when the write is complete.
   */
  writeBinary(
    binary: Binary,
    filename: string | undefined,
    contentType: string | undefined,
    stream: BinarySource
  ): Promise<void> {
    checkFileMetadata(filename, contentType);
    return this.writeFile(this.getKey(binary), contentType, stream);
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

  async readBinary(binary: Binary): Promise<Readable> {
    const output = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: this.getKey(binary),
      })
    );
    return output.Body as Readable;
  }

  async copyBinary(sourceBinary: Binary, destinationBinary: Binary): Promise<void> {
    await this.copyFile(this.getKey(sourceBinary), this.getKey(destinationBinary));
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
  getPresignedUrl(binary: Binary): string {
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

  getKey(binary: Binary): string {
    return 'binary/' + binary.id + '/' + binary.meta?.versionId;
  }
}
