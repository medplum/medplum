import { PassThrough } from 'stream';

export const Storage = jest.fn().mockImplementation(() => ({
  bucket: jest.fn().mockImplementation(() => ({
    file: jest.fn().mockImplementation(() => ({
      createWriteStream: jest.fn().mockReturnValue(new PassThrough()),
      createReadStream: jest.fn().mockImplementation(() => {
        const stream = new PassThrough();
        stream.end('Hello, world!');
        return stream;
      }),
      getSignedUrl: jest.fn().mockResolvedValue(['https://example.com/signed-url']),
    })),
  })),
}));
