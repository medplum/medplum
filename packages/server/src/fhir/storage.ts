import { CopyObjectCommand, GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { Binary } from '@medplum/fhirtypes';
import { copyFileSync, createReadStream, createWriteStream, existsSync, mkdirSync } from 'fs';
import { resolve, sep } from 'path';
import { pipeline, Readable } from 'stream';
import { getConfig } from '../config';

/**
 * Binary input type.
 *
 * This represents a possible input to the writeBinary function.
 *
 * Node.js pipeline types:
 * type PipelineSource<T> = Iterable<T> | AsyncIterable<T> | NodeJS.ReadableStream | PipelineSourceFunction<T>;
 *
 * S3 input types:
 * export type NodeJsRuntimeStreamingBlobPayloadInputTypes = string | Uint8Array | Buffer | Readable;
 *
 * node-fetch body types:
 * Note that while the Fetch Standard requires the property to always be a WHATWG ReadableStream, in node-fetch it is a Node.js Readable stream.
 */
export type BinarySource = Readable | string;

let binaryStorage: BinaryStorage | undefined = undefined;

export function initBinaryStorage(type?: string): void {
  if (type?.startsWith('s3:')) {
    binaryStorage = new S3Storage(type.replace('s3:', ''));
  } else if (type?.startsWith('file:')) {
    binaryStorage = new FileSystemStorage(type.replace('file:', ''));
  } else {
    binaryStorage = undefined;
  }
}

export function getBinaryStorage(): BinaryStorage {
  if (!binaryStorage) {
    throw new Error('Binary storage not initialized');
  }
  return binaryStorage;
}

/**
 * The BinaryStorage interface represents a method of reading and writing binary blobs.
 */
interface BinaryStorage {
  writeBinary(
    binary: Binary,
    filename: string | undefined,
    contentType: string | undefined,
    stream: BinarySource
  ): Promise<void>;

  writeFile(key: string, contentType: string | undefined, stream: BinarySource): Promise<void>;

  readBinary(binary: Binary): Promise<Readable>;

  copyBinary(sourceBinary: Binary, destinationBinary: Binary): Promise<void>;

  copyFile(sourceKey: string, destinationKey: string): Promise<void>;
}

/**
 * The FileSystemStorage class stores binary blobs on the file system.
 * Files are stored in <baseDir>/binary.id/binary.meta.versionId.
 */
class FileSystemStorage implements BinaryStorage {
  private readonly baseDir: string;

  constructor(baseDir: string) {
    this.baseDir = baseDir;
    if (!existsSync(resolve(baseDir))) {
      mkdirSync(resolve(baseDir));
    }
  }

  writeBinary(
    binary: Binary,
    filename: string | undefined,
    contentType: string | undefined,
    stream: BinarySource
  ): Promise<void> {
    checkFileMetadata(filename, contentType);
    return this.writeFile(this.getKey(binary), contentType, stream);
  }

  async writeFile(key: string, _contentType: string | undefined, input: BinarySource): Promise<void> {
    const fullPath = resolve(this.baseDir, key);
    const dir = fullPath.substring(0, fullPath.lastIndexOf(sep));
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    const writeStream = createWriteStream(fullPath, { flags: 'w' });
    return new Promise((resolve, reject) => {
      pipeline(input, writeStream, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  async readBinary(binary: Binary): Promise<Readable> {
    const filePath = this.getPath(binary);
    if (!existsSync(filePath)) {
      throw new Error('File not found');
    }
    return createReadStream(filePath);
  }

  async copyBinary(sourceBinary: Binary, destinationBinary: Binary): Promise<void> {
    await this.copyFile(this.getKey(sourceBinary), this.getKey(destinationBinary));
  }

  async copyFile(sourceKey: string, destinationKey: string): Promise<void> {
    const fullDestinationPath = resolve(this.baseDir, destinationKey);
    const destDir = fullDestinationPath.substring(0, fullDestinationPath.lastIndexOf(sep));
    if (!existsSync(destDir)) {
      mkdirSync(destDir, { recursive: true });
    }
    copyFileSync(resolve(this.baseDir, sourceKey), resolve(this.baseDir, destinationKey));
  }

  private getKey(binary: Binary): string {
    return binary.id + sep + binary.meta?.versionId;
  }

  private getPath(binary: Binary): string {
    return resolve(this.baseDir, this.getKey(binary));
  }
}

/**
 * The S3Storage class stores binary data in an AWS S3 bucket.
 * Files are stored in bucket/binary/binary.id/binary.meta.versionId.
 */
class S3Storage implements BinaryStorage {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(bucket: string) {
    this.client = new S3Client({ region: getConfig().awsRegion });
    this.bucket = bucket;
  }

  /**
   * Writes a binary blob to S3.
   * @param binary The binary resource destination.
   * @param filename Optional binary filename.
   * @param contentType Optional binary content type.
   * @param stream The Node.js stream of readable content.
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
   * @param key The S3 key.
   * @param contentType Optional binary content type.
   * @param stream The Node.js stream of readable content.
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

  private getKey(binary: Binary): string {
    return 'binary/' + binary.id + '/' + binary.meta?.versionId;
  }
}

/**
 * List of blocked file extensions.
 * Derived from "File types blocked in Gmail"
 * https://support.google.com/mail/answer/6590?hl=en#zippy=%2Cmessages-that-have-attachments
 */
const BLOCKED_FILE_EXTENSIONS = [
  '.7z',
  '.ade',
  '.adp',
  '.apk',
  '.appx',
  '.appxbundle',
  '.bat',
  '.cab',
  '.chm',
  '.cmd',
  '.com',
  '.cpl',
  '.dll',
  '.dmg',
  '.ex',
  '.ex_',
  '.exe',
  '.hta',
  '.ins',
  '.isp',
  '.iso',
  '.jar',
  '.jse',
  '.lib',
  '.lnk',
  '.mde',
  '.msc',
  '.msi',
  '.msix',
  '.msixbundle',
  '.msp',
  '.mst',
  '.nsh',
  '.pif',
  '.ps1',
  '.scr',
  '.sct',
  '.shb',
  '.sys',
  '.vb',
  '.vbe',
  '.vbs',
  '.vxd',
  '.wsc',
  '.wsf',
  '.wsh',
];

/**
 * List of blocked content types.
 * Derived from: https://developer.mozilla.org/en-US/docs/Web/HTTP/Basics_of_HTTP/MIME_types/Common_types
 */
const BLOCKED_CONTENT_TYPES = [
  'application/java-archive',
  'application/x-7z-compressed',
  'application/x-bzip',
  'application/x-bzip2',
  'application/x-msdownload',
  'application/x-sh',
  'application/x-tar',
  'application/vnd.apple.installer+xml',
  'application/vnd.microsoft.portable-executable',
  'application/vnd.rar',
  'application/zip',
];

/**
 * Checks file metadata against blocked lists.
 * Throws an execption if the file metadata is blocked.
 * @param filename The input filename.
 * @param contentType The input content type.
 */
function checkFileMetadata(filename: string | undefined, contentType: string | undefined): void {
  if (checkFileExtension(filename)) {
    throw new Error('Invalid file extension');
  }
  if (checkContentType(contentType)) {
    throw new Error('Invalid content type');
  }
}

/**
 * Checks if the file extension is blocked.
 * @param filename The input filename.
 * @returns True if the filename has a blocked file extension.
 */
function checkFileExtension(filename: string | undefined): boolean {
  if (filename) {
    const lower = filename.toLowerCase();
    for (const ext of BLOCKED_FILE_EXTENSIONS) {
      if (lower.endsWith(ext)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Checks if the content type is blocked.
 * @param contentType The input content type.
 * @returns True if the content type is blocked.
 */
function checkContentType(contentType: string | undefined): boolean {
  if (contentType) {
    return BLOCKED_CONTENT_TYPES.includes(contentType.toLowerCase());
  }

  return false;
}
