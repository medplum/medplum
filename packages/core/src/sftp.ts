import { Readable } from 'stream';

/**
 * Reads data from a Readable stream and returns a Promise that resolves with a Buffer containing all the data.
 * @param stream - The Readable stream to read from.
 * @returns A Promise that resolves with a Buffer containing all the data from the Readable stream.
 */
export function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Uint8Array[] = [];
  return new Promise<Buffer>((resolve, reject) => {
    stream.on('data', (chunk: Uint8Array) => chunks.push(Buffer.from(chunk)));
    stream.on('error', (err: Error) => {
      stream.destroy();
      reject(err);
    });
    stream.on('end', () => {
      resolve(Buffer.concat(chunks));
    });
    stream.on('close', () => {
      stream.destroy();
    });
  });
}
