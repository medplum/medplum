import {
  CloudFormationClient,
  CloudFormationClientResolvedConfig,
  DescribeStackResourcesCommand,
  DescribeStacksCommand,
  ListStacksCommand,
  ServiceInputTypes,
  ServiceOutputTypes,
} from '@aws-sdk/client-cloudformation';
import {
  CloudFrontClient,
  CloudFrontClientResolvedConfig,
  CreateInvalidationCommand,
} from '@aws-sdk/client-cloudfront';
import { PutObjectCommand, S3Client, S3ClientResolvedConfig } from '@aws-sdk/client-s3';
import { AwsStub, mockClient } from 'aws-sdk-client-mock';
import fastGlob from 'fast-glob';
import fetch from 'node-fetch';
import fs from 'node:fs';
import { Readable, Writable } from 'node:stream';
import tar from 'tar';
import { main } from '../index';

jest.mock('fast-glob', () => ({
  sync: jest.fn(() => []),
}));

jest.mock('node:fs', () => ({
  createReadStream: jest.fn(),
  existsSync: jest.fn(),
  mkdtempSync: jest.fn(() => '/tmp/'),
  readdirSync: jest.fn(() => []),
  readFileSync: jest.fn(),
  rmSync: jest.fn(),
  writeFileSync: jest.fn(),
  constants: {
    O_CREAT: 0,
  },
  promises: {
    readFile: jest.fn(async () => '{}'),
  },
}));

jest.mock('node-fetch', () => jest.fn());

jest.mock('tar', () => ({
  extract: jest.fn(),
}));

const { Response: NodeFetchResponse } = jest.requireActual('node-fetch');

let cfMock: AwsStub<ServiceInputTypes, ServiceOutputTypes, CloudFormationClientResolvedConfig>;
let s3Mock: AwsStub<ServiceInputTypes, ServiceOutputTypes, S3ClientResolvedConfig>;
let cloudFrontMock: AwsStub<ServiceInputTypes, ServiceOutputTypes, CloudFrontClientResolvedConfig>;

describe('update-app command', () => {
  let processError: jest.SpyInstance;

  beforeAll(() => {
    process.exit = jest.fn<never, any>().mockImplementation(function exit(exitCode: number) {
      throw new Error(`Process exited with exit code ${exitCode}`);
    }) as unknown as typeof process.exit;
    processError = jest.spyOn(process.stderr, 'write').mockImplementation(jest.fn());
  });

  beforeEach(() => {
    jest.clearAllMocks();
    cfMock = mockClient(CloudFormationClient);

    cfMock.on(ListStacksCommand).resolves({
      StackSummaries: [
        {
          StackId: '123',
          StackName: 'medplum-dev',
          StackStatus: 'CREATE_COMPLETE',
          CreationTime: new Date(),
        },
        {
          StackId: '124',
          StackName: 'medplum-incomplete',
          StackStatus: 'UPDATE_IN_PROGRESS',
          CreationTime: new Date(),
        },
      ],
    });

    cfMock.on(DescribeStacksCommand, { StackName: 'medplum-dev' }).resolves({
      Stacks: [
        {
          StackId: '123',
          StackName: 'medplum-dev',
          StackStatus: 'CREATE_COMPLETE',
          CreationTime: new Date(),
          Tags: [
            {
              Key: 'medplum:environment',
              Value: 'dev',
            },
          ],
        },
      ],
    });

    cfMock.on(DescribeStackResourcesCommand, { StackName: 'medplum-dev' }).resolves({
      StackResources: [
        {
          ResourceType: 'AWS::S3::Bucket',
          ResourceStatus: 'CREATE_COMPLETE',
          LogicalResourceId: 'FrontEndAppBucket',
          PhysicalResourceId: 'app.test.medplum.com',
          Timestamp: new Date(),
        },
        {
          ResourceType: 'AWS::CloudFront::Distribution',
          ResourceStatus: 'CREATE_COMPLETE',
          LogicalResourceId: 'FrontEndAppDistribution',
          PhysicalResourceId: '123',
          Timestamp: new Date(),
        },
      ],
    });

    cfMock.on(DescribeStacksCommand, { StackName: 'medplum-incomplete' }).resolves({
      Stacks: [
        {
          StackId: '123',
          StackName: 'medplum-incomplete',
          StackStatus: 'UPDATE_IN_PROGRESS',
          CreationTime: new Date(),
          Tags: [
            {
              Key: 'medplum:environment',
              Value: 'incomplete',
            },
          ],
        },
      ],
    });

    cfMock.on(DescribeStackResourcesCommand, { StackName: 'medplum-incomplete' }).resolves({
      StackResources: [],
    });

    s3Mock = mockClient(S3Client);
    s3Mock.on(PutObjectCommand).resolves({});

    cloudFrontMock = mockClient(CloudFrontClient) as AwsStub<
      ServiceInputTypes,
      ServiceOutputTypes,
      CloudFrontClientResolvedConfig
    >;
    cloudFrontMock.on(CreateInvalidationCommand).resolves({});
  });

  afterEach(() => {
    (fetch as jest.MockedFunction<typeof fetch>).mockReset();
  });

  test('Update app command', async () => {
    console.log = jest.fn();

    // Mock the config file
    (fs.existsSync as jest.Mock).mockReturnValueOnce(true);
    (fs.readFileSync as jest.Mock).mockReturnValueOnce(
      JSON.stringify({
        baseUrl: 'https://api.staging.medplum.com/',
        clientId: '',
        googleClientId: '659647315343-c0p9rkl3pq38q18r13bkrchs4iqjogv1.apps.googleusercontent.com',
        recaptchaSiteKey: '6LfXscQdAAAAAKlNFAoXqjliz0xbR8hvQw_pZfb2',
        registerEnabled: true,
      })
    );

    // Mock the 2 fetch requests
    (fetch as jest.MockedFunction<typeof fetch>)
      // First request is for the package metadata
      .mockResolvedValueOnce(
        new NodeFetchResponse('{"dist":{"tarball":"https://example.com/tarball.tar.gz"}}', { status: 200 })
      )
      // Second request is for the tarball
      .mockResolvedValueOnce(
        new NodeFetchResponse(
          new Readable({
            read() {
              this.push(null); // Signal the end of the stream
            },
          }),
          { status: 200 }
        )
      );

    // Mock the tar extract
    (tar.extract as unknown as jest.Mock).mockReturnValueOnce(
      new Writable({
        write(_chunk, _encoding, callback) {
          callback();
        },
      })
    );

    // Mock the readdirSync to list files to replace variables
    (fs.readdirSync as jest.Mock).mockImplementation((folderName) => {
      if (folderName.endsWith('dist')) {
        return [{ name: 'js', isDirectory: () => true, isFile: () => false }];
      }
      return [
        { name: 'main.js', isDirectory: () => false, isFile: () => true },
        { name: 'nonejsfile', isDirectory: () => false, isFile: () => true },
      ];
    });

    // Mock the readFileSync to read the file to replace variables
    (fs.readFileSync as jest.Mock).mockReturnValueOnce('console.log("Hello, world!");');

    // Mock the glob search for files to upload
    (fastGlob.sync as jest.Mock).mockReturnValueOnce(['index.html']);

    await main(['node', 'index.js', 'aws', 'update-app', 'dev']);

    expect(fetch).toHaveBeenNthCalledWith(1, 'https://registry.npmjs.org/@medplum/app/latest');
    expect(fetch).toHaveBeenNthCalledWith(2, 'https://example.com/tarball.tar.gz');
    expect(console.log).toHaveBeenCalledWith('Done');
    expect(s3Mock.calls()).toHaveLength(1);
    expect(cloudFrontMock.calls()).toHaveLength(1);
  });

  test('Update app dryrun', async () => {
    console.log = jest.fn();

    // Mock the config file
    (fs.existsSync as jest.Mock).mockReturnValueOnce(true);
    (fs.readFileSync as jest.Mock).mockReturnValueOnce(
      JSON.stringify({
        baseUrl: 'https://api.staging.medplum.com/',
        clientId: '',
        googleClientId: '659647315343-c0p9rkl3pq38q18r13bkrchs4iqjogv1.apps.googleusercontent.com',
        recaptchaSiteKey: '6LfXscQdAAAAAKlNFAoXqjliz0xbR8hvQw_pZfb2',
        registerEnabled: true,
      })
    );

    // Mock the 2 fetch requests
    (fetch as jest.MockedFunction<typeof fetch>)
      // First request is for the package metadata
      .mockResolvedValueOnce(
        new NodeFetchResponse('{"dist":{"tarball":"https://example.com/tarball.tar.gz"}}', { status: 200 })
      )
      // Second request is for the tarball
      .mockResolvedValueOnce(
        new NodeFetchResponse(
          new Readable({
            read() {
              this.push(null); // Signal the end of the stream
            },
          }),
          { status: 200 }
        )
      );

    // Mock the tar extract
    (tar.extract as unknown as jest.Mock).mockReturnValueOnce(
      new Writable({
        write(_chunk, _encoding, callback) {
          callback();
        },
      })
    );

    // Mock the readdirSync to list files to replace variables
    (fs.readdirSync as jest.Mock).mockImplementation((folderName) => {
      if (folderName.endsWith('dist')) {
        return [{ name: 'js', isDirectory: () => true, isFile: () => false }];
      }
      return [
        { name: 'main.js', isDirectory: () => false, isFile: () => true },
        { name: 'nonejsfile', isDirectory: () => false, isFile: () => true },
      ];
    });

    // Mock the readFileSync to read the file to replace variables
    (fs.readFileSync as jest.Mock).mockReturnValueOnce('console.log("Hello, world!");');

    // Mock the glob search for files to upload
    (fastGlob.sync as jest.Mock).mockReturnValueOnce(['index.html']);

    await main(['node', 'index.js', 'aws', 'update-app', 'dev', '--dryrun']);

    expect(fetch).toHaveBeenNthCalledWith(1, 'https://registry.npmjs.org/@medplum/app/latest');
    expect(fetch).toHaveBeenNthCalledWith(2, 'https://example.com/tarball.tar.gz');
    expect(console.log).toHaveBeenCalledWith('Done');
    expect(s3Mock.calls()).toHaveLength(0);
    expect(cloudFrontMock.calls()).toHaveLength(0);
  });

  test('Update app command without optional configs', async () => {
    console.log = jest.fn();

    // Mock the config file
    (fs.existsSync as jest.Mock).mockReturnValueOnce(true);
    (fs.readFileSync as jest.Mock).mockReturnValueOnce(
      JSON.stringify({
        baseUrl: 'https://api.staging.medplum.com/',
      })
    );

    // Mock the 2 fetch requests
    (fetch as jest.MockedFunction<typeof fetch>)
      // First request is for the package metadata
      .mockResolvedValueOnce(
        new NodeFetchResponse('{"dist":{"tarball":"https://example.com/tarball.tar.gz"}}', { status: 200 })
      )
      // Second request is for the tarball
      .mockResolvedValueOnce(
        new NodeFetchResponse(
          new Readable({
            read() {
              this.push(null); // Signal the end of the stream
            },
          }),
          { status: 200 }
        )
      );

    // Mock the tar extract
    (tar.extract as unknown as jest.Mock).mockReturnValueOnce(
      new Writable({
        write(_chunk, _encoding, callback) {
          callback();
        },
      })
    );

    // Mock the readdirSync to list files to replace variables
    (fs.readdirSync as jest.Mock).mockImplementation((folderName) => {
      if (folderName.endsWith('dist')) {
        return [{ name: 'js', isDirectory: () => true, isFile: () => false }];
      }
      return [{ name: 'main.js', isDirectory: () => false, isFile: () => true }];
    });

    // Mock the readFileSync to read the file to replace variables
    (fs.readFileSync as jest.Mock).mockReturnValueOnce('console.log("Hello, world!");');

    // Mock the glob search for files to upload
    (fastGlob.sync as jest.Mock).mockReturnValueOnce(['index.html']);

    await main(['node', 'index.js', 'aws', 'update-app', 'dev']);

    expect(console.log).toHaveBeenCalledWith('Done');
  });

  test('Update app config not found', async () => {
    (fs.existsSync as jest.Mock).mockReturnValueOnce(false);

    console.log = jest.fn();
    await expect(main(['node', 'index.js', 'aws', 'update-app', 'not-found'])).rejects.toThrow(
      'Process exited with exit code 1'
    );
    expect(console.log).toHaveBeenCalledWith('Config not found: not-found (medplum.not-found.config.json)');
    expect(processError).toHaveBeenCalledWith('Error: Config not found: not-found\n');
  });

  test('Update app config custom filename not found', async () => {
    (fs.existsSync as jest.Mock).mockReturnValueOnce(false);

    console.log = jest.fn();
    await expect(main(['node', 'index.js', 'aws', 'update-app', 'not-found', '--file', 'foo.json'])).rejects.toThrow(
      'Process exited with exit code 1'
    );
    expect(console.log).toHaveBeenCalledWith('Config not found: not-found (foo.json)');
    expect(processError).toHaveBeenCalledWith('Error: Config not found: not-found\n');
  });

  test('Update app stack not found', async () => {
    // Mock the config file
    (fs.existsSync as jest.Mock).mockReturnValueOnce(true);
    (fs.readFileSync as jest.Mock).mockReturnValueOnce('{}');

    console.log = jest.fn();
    await expect(main(['node', 'index.js', 'aws', 'update-app', 'not-found'])).rejects.toThrow(
      'Process exited with exit code 1'
    );
    expect(console.log).toHaveBeenCalledWith('Stack not found: not-found');
    expect(processError).toHaveBeenCalledWith('Error: Stack not found: not-found\n');
  });

  test('Update app stack incomplete', async () => {
    // Mock the config file
    (fs.existsSync as jest.Mock).mockReturnValueOnce(true);
    (fs.readFileSync as jest.Mock).mockReturnValueOnce('{}');

    console.log = jest.fn();
    await expect(main(['node', 'index.js', 'aws', 'update-app', 'incomplete'])).rejects.toThrow(
      'Process exited with exit code 1'
    );
    expect(processError).toHaveBeenCalledWith('Error: App bucket not found for stack incomplete\n');
  });
});
