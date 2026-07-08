// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type {
  CloudFormationClientResolvedConfig,
  ServiceInputTypes as CloudFormationServiceInputTypes,
  ServiceOutputTypes as CloudFormationServiceOutputTypes,
} from '@aws-sdk/client-cloudformation';
import {
  CloudFormationClient,
  DescribeStackResourcesCommand,
  DescribeStacksCommand,
  ListStacksCommand,
} from '@aws-sdk/client-cloudformation';
import type {
  CloudFrontClientResolvedConfig,
  ServiceInputTypes as CloudFrontServiceInputTypes,
  ServiceOutputTypes as CloudFrontServiceOutputTypes,
} from '@aws-sdk/client-cloudfront';
import { CloudFrontClient, CreateInvalidationCommand } from '@aws-sdk/client-cloudfront';
import type {
  S3ClientResolvedConfig,
  ServiceInputTypes as S3ServiceInputTypes,
  ServiceOutputTypes as S3ServiceOutputTypes,
} from '@aws-sdk/client-s3';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { AwsStub } from 'aws-sdk-client-mock';
import { mockClient } from 'aws-sdk-client-mock';
import fastGlob from 'fast-glob';
import fs from 'node:fs';
import { Writable } from 'node:stream';
import * as tar from 'tar';
import type { Mock, MockInstance } from 'vitest';
import { main } from '../index';

vi.mock('fast-glob', () => {
  const mock = { sync: vi.fn(() => []) };
  return { default: mock, ...mock };
});

vi.mock('node:fs', () => {
  const mock = {
    createReadStream: vi.fn(),
    existsSync: vi.fn(),
    mkdtempSync: vi.fn(() => '/tmp/'),
    readdirSync: vi.fn(() => []),
    readFileSync: vi.fn(),
    rmSync: vi.fn(),
    writeFileSync: vi.fn(),
    constants: {
      O_CREAT: 0,
    },
    promises: {
      readFile: vi.fn(async () => '{}'),
    },
  };
  return { default: mock, ...mock };
});

vi.mock('tar', () => ({
  extract: vi.fn(),
}));

const fetchMock = vi.spyOn(globalThis, 'fetch');

function emptyResponse(): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.close();
    },
  });
}

let cfMock: AwsStub<
  CloudFormationServiceInputTypes,
  CloudFormationServiceOutputTypes,
  CloudFormationClientResolvedConfig
>;
let s3Mock: AwsStub<S3ServiceInputTypes, S3ServiceOutputTypes, S3ClientResolvedConfig>;
let cloudFrontMock: AwsStub<CloudFrontServiceInputTypes, CloudFrontServiceOutputTypes, CloudFrontClientResolvedConfig>;

describe('update-app command', () => {
  let processError: MockInstance;

  beforeAll(() => {
    process.exit = vi.fn<(exitCode?: number) => never>().mockImplementation(function exit(exitCode?: number) {
      throw new Error(`Process exited with exit code ${exitCode}`);
    });
    processError = vi.spyOn(process.stderr, 'write').mockImplementation(vi.fn());
  });

  beforeEach(() => {
    vi.clearAllMocks();
    (fs.existsSync as Mock).mockReset();
    (fs.readFileSync as Mock).mockReset();
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

    cloudFrontMock = mockClient(CloudFrontClient);
    cloudFrontMock.on(CreateInvalidationCommand).resolves({});
  });

  afterEach(() => {
    fetchMock.mockReset();
  });

  test('Update app command', async () => {
    console.log = vi.fn();

    // Mock the config file
    (fs.existsSync as Mock).mockReturnValueOnce(true);
    (fs.readFileSync as Mock).mockReturnValueOnce(
      JSON.stringify({
        baseUrl: 'https://api.staging.medplum.com/',
        clientId: '',
        googleClientId: '659647315343-c0p9rkl3pq38q18r13bkrchs4iqjogv1.apps.googleusercontent.com',
        recaptchaSiteKey: '6LfXscQdAAAAAKlNFAoXqjliz0xbR8hvQw_pZfb2',
        registerEnabled: true,
      })
    );

    // Mock the 2 fetch requests
    fetchMock
      // First request is for the package metadata
      .mockResolvedValueOnce(new Response('{"dist":{"tarball":"https://example.com/tarball.tar.gz"}}', { status: 200 }))
      // Second request is for the tarball
      .mockResolvedValueOnce(new Response(emptyResponse(), { status: 200 }));

    // Mock the tar extract
    (tar.extract as unknown as Mock).mockReturnValueOnce(
      new Writable({
        write(_chunk, _encoding, callback) {
          callback();
        },
      })
    );

    // Mock the readdirSync to list files to replace variables
    (fs.readdirSync as Mock).mockImplementation((folderName: string) => {
      if (folderName.endsWith('dist')) {
        return [{ name: 'js', isDirectory: () => true, isFile: () => false }];
      }
      return [
        { name: 'main.js', isDirectory: () => false, isFile: () => true },
        { name: 'nonejsfile', isDirectory: () => false, isFile: () => true },
      ];
    });

    // Mock the readFileSync to read the file to replace variables
    (fs.readFileSync as Mock).mockReturnValueOnce('console.log("Hello, world!");');

    // Mock the glob search for files to upload
    (fastGlob.sync as Mock).mockReturnValueOnce(['index.html']);

    await main(['node', 'index.js', 'aws', 'update-app', 'dev']);

    expect(fetchMock).toHaveBeenNthCalledWith(1, 'https://registry.npmjs.org/@medplum/app/latest');
    expect(fetchMock).toHaveBeenNthCalledWith(2, 'https://example.com/tarball.tar.gz');
    expect(console.log).toHaveBeenCalledWith('Done');
    expect(s3Mock.calls()).toHaveLength(1);
    expect(cloudFrontMock.calls()).toHaveLength(1);
  });

  test('Update app dryrun', async () => {
    console.log = vi.fn();

    // Mock the config file
    (fs.existsSync as Mock).mockReturnValueOnce(true);
    (fs.readFileSync as Mock).mockReturnValueOnce(
      JSON.stringify({
        baseUrl: 'https://api.staging.medplum.com/',
        clientId: '',
        googleClientId: '659647315343-c0p9rkl3pq38q18r13bkrchs4iqjogv1.apps.googleusercontent.com',
        recaptchaSiteKey: '6LfXscQdAAAAAKlNFAoXqjliz0xbR8hvQw_pZfb2',
        registerEnabled: true,
      })
    );

    // Mock the 2 fetch requests
    fetchMock
      // First request is for the package metadata
      .mockResolvedValueOnce(new Response('{"dist":{"tarball":"https://example.com/tarball.tar.gz"}}', { status: 200 }))
      // Second request is for the tarball
      .mockResolvedValueOnce(new Response(emptyResponse(), { status: 200 }));

    // Mock the tar extract
    (tar.extract as unknown as Mock).mockReturnValueOnce(
      new Writable({
        write(_chunk, _encoding, callback) {
          callback();
        },
      })
    );

    // Mock the readdirSync to list files to replace variables
    (fs.readdirSync as Mock).mockImplementation((folderName: string) => {
      if (folderName.endsWith('dist')) {
        return [{ name: 'js', isDirectory: () => true, isFile: () => false }];
      }
      return [
        { name: 'main.js', isDirectory: () => false, isFile: () => true },
        { name: 'nonejsfile', isDirectory: () => false, isFile: () => true },
      ];
    });

    // Mock the readFileSync to read the file to replace variables
    (fs.readFileSync as Mock).mockReturnValueOnce('console.log("Hello, world!");');

    // Mock the glob search for files to upload
    (fastGlob.sync as Mock).mockReturnValueOnce(['index.html']);

    await main(['node', 'index.js', 'aws', 'update-app', 'dev', '--dryrun']);

    expect(fetchMock).toHaveBeenNthCalledWith(1, 'https://registry.npmjs.org/@medplum/app/latest');
    expect(fetchMock).toHaveBeenNthCalledWith(2, 'https://example.com/tarball.tar.gz');
    expect(console.log).toHaveBeenCalledWith('Done');
    expect(s3Mock.calls()).toHaveLength(0);
    expect(cloudFrontMock.calls()).toHaveLength(0);
  });

  test('Update app command without optional configs', async () => {
    console.log = vi.fn();

    // Mock the config file
    (fs.existsSync as Mock).mockReturnValueOnce(true);
    (fs.readFileSync as Mock).mockReturnValueOnce(
      JSON.stringify({
        baseUrl: 'https://api.staging.medplum.com/',
      })
    );

    // Mock the 2 fetch requests
    fetchMock
      // First request is for the package metadata
      .mockResolvedValueOnce(new Response('{"dist":{"tarball":"https://example.com/tarball.tar.gz"}}', { status: 200 }))
      // Second request is for the tarball
      .mockResolvedValueOnce(new Response(emptyResponse(), { status: 200 }));

    // Mock the tar extract
    (tar.extract as unknown as Mock).mockReturnValueOnce(
      new Writable({
        write(_chunk, _encoding, callback) {
          callback();
        },
      })
    );

    // Mock the readdirSync to list files to replace variables
    (fs.readdirSync as Mock).mockImplementation((folderName: string) => {
      if (folderName.endsWith('dist')) {
        return [{ name: 'js', isDirectory: () => true, isFile: () => false }];
      }
      return [{ name: 'main.js', isDirectory: () => false, isFile: () => true }];
    });

    // Mock the readFileSync to read the file to replace variables
    (fs.readFileSync as Mock).mockReturnValueOnce('console.log("Hello, world!");');

    // Mock the glob search for files to upload
    (fastGlob.sync as Mock).mockReturnValueOnce(['index.html']);

    await main(['node', 'index.js', 'aws', 'update-app', 'dev']);

    expect(console.log).toHaveBeenCalledWith('Done');
  });

  test('Update app config not found', async () => {
    (fs.existsSync as Mock).mockReturnValueOnce(false);

    console.log = vi.fn();
    await expect(main(['node', 'index.js', 'aws', 'update-app', 'not-found'])).rejects.toThrow(
      'Process exited with exit code 1'
    );
    expect(console.log).toHaveBeenCalledWith('Config not found: not-found (medplum.not-found.config.json)');
    expect(processError).toHaveBeenCalledWith('Error: Config not found: not-found\n');
  });

  test('Update app config custom filename not found', async () => {
    (fs.existsSync as Mock).mockReturnValueOnce(false);

    console.log = vi.fn();
    await expect(main(['node', 'index.js', 'aws', 'update-app', 'not-found', '--file', 'foo.json'])).rejects.toThrow(
      'Process exited with exit code 1'
    );
    expect(console.log).toHaveBeenCalledWith('Config not found: not-found (foo.json)');
    expect(processError).toHaveBeenCalledWith('Error: Config not found: not-found\n');
  });

  test('Update app stack not found', async () => {
    // Mock the config file
    (fs.existsSync as Mock).mockReturnValueOnce(true);
    (fs.readFileSync as Mock).mockReturnValueOnce('{}');

    console.log = vi.fn();
    await expect(main(['node', 'index.js', 'aws', 'update-app', 'not-found'])).rejects.toThrow(
      'Process exited with exit code 1'
    );
    expect(console.log).toHaveBeenCalledWith('Stack not found: not-found');
    expect(processError).toHaveBeenCalledWith('Error: Stack not found: not-found\n');
  });

  test('Update app stack incomplete', async () => {
    // Mock the config file
    (fs.existsSync as Mock).mockReturnValueOnce(true);
    (fs.readFileSync as Mock).mockReturnValueOnce('{}');

    console.log = vi.fn();
    await expect(main(['node', 'index.js', 'aws', 'update-app', 'incomplete'])).rejects.toThrow(
      'Process exited with exit code 1'
    );
    expect(processError).toHaveBeenCalledWith('Error: App bucket not found for stack incomplete\n');
  });
});
