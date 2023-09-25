import {
  CloudFormationClient,
  CloudFormationClientResolvedConfig,
  DescribeStackResourcesCommand,
  DescribeStacksCommand,
  ListStacksCommand,
  ServiceInputTypes,
  ServiceOutputTypes,
  StackResource,
} from '@aws-sdk/client-cloudformation';
import {
  CloudFrontClient,
  CloudFrontClientResolvedConfig,
  CreateInvalidationCommand,
} from '@aws-sdk/client-cloudfront';
import { GetBucketPolicyCommand, PutBucketPolicyCommand, S3Client, S3ClientResolvedConfig } from '@aws-sdk/client-s3';
import { AwsStub, mockClient } from 'aws-sdk-client-mock';
import fs from 'fs';
import { main } from '../index';
import { updateBucketPolicy } from './update-bucket-policies';

jest.mock('fs', () => ({
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

let cfMock: AwsStub<ServiceInputTypes, ServiceOutputTypes, CloudFormationClientResolvedConfig>;
let s3Mock: AwsStub<ServiceInputTypes, ServiceOutputTypes, S3ClientResolvedConfig>;
let cloudFrontMock: AwsStub<ServiceInputTypes, ServiceOutputTypes, CloudFrontClientResolvedConfig>;

describe('update-bucket-policies command', () => {
  beforeAll(() => {
    cfMock = mockClient(CloudFormationClient);

    cfMock.on(ListStacksCommand).resolves({
      StackSummaries: [
        {
          StackId: '123',
          StackName: 'medplum-dev',
          StackStatus: 'CREATE_COMPLETE',
          CreationTime: new Date(),
        },
      ],
    });

    cfMock.on(DescribeStacksCommand).resolves({
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

    cfMock.on(DescribeStackResourcesCommand).resolves({
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
        {
          ResourceType: 'AWS::CloudFront::CloudFrontOriginAccessIdentity',
          ResourceStatus: 'CREATE_COMPLETE',
          LogicalResourceId: 'FrontEndOriginAccessIdentity',
          PhysicalResourceId: '123',
          Timestamp: new Date(),
        },
        {
          ResourceType: 'AWS::S3::Bucket',
          ResourceStatus: 'CREATE_COMPLETE',
          LogicalResourceId: 'StorageStorageBucket',
          PhysicalResourceId: 'storage.test.medplum.com',
          Timestamp: new Date(),
        },
        {
          ResourceType: 'AWS::CloudFront::Distribution',
          ResourceStatus: 'CREATE_COMPLETE',
          LogicalResourceId: 'StorageStorageDistribution',
          PhysicalResourceId: '123',
          Timestamp: new Date(),
        },
        {
          ResourceType: 'AWS::CloudFront::CloudFrontOriginAccessIdentity',
          ResourceStatus: 'CREATE_COMPLETE',
          LogicalResourceId: 'StorageOriginAccessIdentity',
          PhysicalResourceId: '123',
          Timestamp: new Date(),
        },
      ],
    });

    s3Mock = mockClient(S3Client);
    s3Mock.on(GetBucketPolicyCommand).resolves({ Policy: '{}' });
    s3Mock.on(PutBucketPolicyCommand).resolves({});

    cloudFrontMock = mockClient(CloudFrontClient) as AwsStub<
      ServiceInputTypes,
      ServiceOutputTypes,
      CloudFrontClientResolvedConfig
    >;
    cloudFrontMock.on(CreateInvalidationCommand).resolves({});
  });

  test('Success', async () => {
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

    await main(['node', 'index.js', 'aws', 'update-bucket-policies', 'dev']);
    expect(console.log).toBeCalledWith('App bucket policy:');
  });

  test('Config not found', async () => {
    (fs.existsSync as jest.Mock).mockReturnValueOnce(false);

    console.log = jest.fn();
    await main(['node', 'index.js', 'aws', 'update-bucket-policies', 'not-found']);
    expect(console.log).toBeCalledWith('Config not found');
  });

  test('Stack not found', async () => {
    console.log = jest.fn();

    // Mock the config file
    (fs.existsSync as jest.Mock).mockReturnValueOnce(true);
    (fs.readFileSync as jest.Mock).mockReturnValueOnce('{}');

    await main(['node', 'index.js', 'aws', 'update-bucket-policies', 'not-found']);
    expect(console.log).toBeCalledWith('Stack not found');
  });

  describe('updateBucketPolicy', () => {
    test('Bucket not found', async () => {
      console.log = jest.fn();
      await updateBucketPolicy('App', undefined, undefined, undefined, {});
      expect(console.log).toBeCalledWith('App bucket not found');
    });

    test('Distribution not found', async () => {
      console.log = jest.fn();
      await updateBucketPolicy('App', { PhysicalResourceId: 'x' } as StackResource, undefined, undefined, {});
      expect(console.log).toBeCalledWith('App distribution not found');
    });

    test('OAI not found', async () => {
      console.log = jest.fn();
      await updateBucketPolicy(
        'App',
        { PhysicalResourceId: 'x' } as StackResource,
        { PhysicalResourceId: 'x' } as StackResource,
        undefined,
        {}
      );
      expect(console.log).toBeCalledWith('App OAI not found');
    });

    test('Dry run', async () => {
      console.log = jest.fn();
      await updateBucketPolicy(
        'App',
        { PhysicalResourceId: 'x' } as StackResource,
        { PhysicalResourceId: 'x' } as StackResource,
        { PhysicalResourceId: 'x' } as StackResource,
        { dryrun: true }
      );
      expect(console.log).toBeCalledWith('Dry run - skipping updates');
    });
  });
});
