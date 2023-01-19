import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { Binary } from '@medplum/fhirtypes';
import { createReadStream, createWriteStream, existsSync, mkdirSync } from 'fs';
import { resolve } from 'path';
import { Readable } from 'stream';
import { getConfig } from '../config';

let binaryStorage: BinaryStorage | undefined = undefined;

export function initBinaryStorage(type: string): void {
  if (type.startsWith('s3:')) {
    binaryStorage = new S3Storage(type.replace('s3:', ''));
  } else if (type.startsWith('file:')) {
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
    stream: Readable | NodeJS.ReadableStream
  ): Promise<void>;

  readBinary(binary: Binary): Promise<Readable>;
}

/**
 * The FileSystemStorage class stores binary blobs on the file system.
 * Files are stored in <baseDir>/binary.id/binary.meta.versionId.
 */
class FileSystemStorage implements BinaryStorage {
  readonly #baseDir: string;

  constructor(baseDir: string) {
    this.#baseDir = baseDir;
    if (!existsSync(resolve(baseDir))) {
      mkdirSync(resolve(baseDir));
    }
  }

  async writeBinary(
    binary: Binary,
    filename: string | undefined,
    contentType: string | undefined,
    stream: Readable | NodeJS.ReadableStream
  ): Promise<void> {
    checkFileMetadata(filename, contentType);
    const dir = this.#getDir(binary);
    if (!existsSync(dir)) {
      mkdirSync(dir);
    }
    const writeStream = createWriteStream(this.#getPath(binary), { flags: 'w' });
    stream.pipe(writeStream);
    return new Promise((resolve, reject) => {
      writeStream.on('close', resolve);
      writeStream.on('error', reject);
    });
  }

  async readBinary(binary: Binary): Promise<Readable> {
    const filePath = this.#getPath(binary);
    if (!existsSync(filePath)) {
      throw new Error('File not found');
    }
    return createReadStream(filePath);
  }

  #getDir(binary: Binary): string {
    return resolve(this.#baseDir, binary.id as string);
  }

  #getPath(binary: Binary): string {
    return resolve(this.#getDir(binary), binary.meta?.versionId as string);
  }
}

/**
 * The S3Storage class stores binary data in an AWS S3 bucket.
 * Files are stored in bucket/binary/binary.id/binary.meta.versionId.
 */
class S3Storage implements BinaryStorage {
  readonly #client: S3Client;
  readonly #bucket: string;

  constructor(bucket: string) {
    this.#client = new S3Client({ region: getConfig().awsRegion });
    this.#bucket = bucket;
  }

  /**
   * Writes a binary blob to S3.
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
   *
   * @param binary The binary resource destination.
   * @param req The HTTP request with the binary content.
   */
  async writeBinary(
    binary: Binary,
    filename: string | undefined,
    contentType: string | undefined,
    stream: Readable | NodeJS.ReadableStream
  ): Promise<void> {
    checkFileMetadata(filename, contentType);
    const upload = new Upload({
      params: {
        Bucket: this.#bucket,
        Key: this.#getKey(binary),
        CacheControl: 'max-age=3600, s-maxage=86400',
        ContentType: contentType || 'application/octet-stream',
        Body: stream as Readable | ReadableStream,
      },
      client: this.#client,
      queueSize: 3,
    });

    await upload.done();
  }

  async readBinary(binary: Binary): Promise<Readable> {
    const output = await this.#client.send(
      new GetObjectCommand({
        Bucket: this.#bucket,
        Key: this.#getKey(binary),
      })
    );
    return output.Body as Readable;
  }

  #getKey(binary: Binary): string {
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
  '.js',
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
  'text/javascript',
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
