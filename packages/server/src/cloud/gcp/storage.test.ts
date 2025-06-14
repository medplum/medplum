import { Binary } from '@medplum/fhirtypes';
import { PassThrough } from 'stream';
import { GoogleCloudStorage } from './storage';

describe('Integration Tests for GoogleCloudStorage', () => {
  const testStorageString = 'your-project-id:your-test-bucket';
  let storage: GoogleCloudStorage;

  beforeEach(() => {
    storage = new GoogleCloudStorage(testStorageString);
  });

  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  const testBinary: Binary = {
    id: 'test123',
    meta: { versionId: 'v1' },
    resourceType: 'Binary', // Added resourceType
    contentType: 'text/plain', // Added contentType
  };

  test('should write and then read a binary file', async () => {
    const content = 'Hello, world!';
    const contentStream = new PassThrough();
    contentStream.end(content);

    await storage.writeBinary(testBinary, 'test.txt', 'text/plain', contentStream);

    const readStream = await storage.readBinary(testBinary);
    let data = '';
    for await (const chunk of readStream) {
      data += chunk;
    }
    expect(data).toEqual(content);
  });

  test('should write a string', async () => {
    const content = 'Hello, world!';

    await storage.writeBinary(testBinary, 'test.txt', 'text/plain', content);

    const readStream = await storage.readBinary(testBinary);
    let data = '';
    for await (const chunk of readStream) {
      data += chunk;
    }
    expect(data).toEqual(content);
  });

  test('should generate a valid signed URL', async () => {
    const url = await storage.getPresignedUrl(testBinary);
    expect(url).toContain('https://');
  });
});
