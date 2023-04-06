export const GetObjectCommand = jest.fn(() => ({}));

export const S3Client = jest.fn(() => ({
  send: jest.fn(),
}));
