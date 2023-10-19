import { GetParametersByPathCommand, SSMClient } from '@aws-sdk/client-ssm';
import { AwsClientStub, mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest';
import { normalizeInfraConfig } from './config';

describe('Config', () => {
  let mockSSMClient: AwsClientStub<SSMClient>;

  beforeEach(() => {
    mockSSMClient = mockClient(SSMClient);

    mockSSMClient.on(GetParametersByPathCommand).resolves({
      Parameters: [
        { Name: 'stackName', Value: 'MyMedplumStack' },
        { Name: 'apiInternetFacing', Value: 'false' },
        { Name: 'appApiProxy', Value: 'true' },
        { Name: 'rdsInstances', Value: '10' },
        { Name: 'desiredServerCount', Value: '0' },
      ],
    });
  });

  afterEach(() => {
    mockSSMClient.restore();
  });

  test('It should function', async () => {
    const result = await normalizeInfraConfig({
      stackName: { system: 'aws_ssm_parameter_store', key: '/:stackName', type: 'string' },
      apiInternetFacing: { system: 'aws_ssm_parameter_store', key: '/:apiInternetFacing', type: 'boolean' },
      appApiProxy: { system: 'aws_ssm_parameter_store', key: '/:appApiProxy', type: 'boolean' },
      rdsInstances: { system: 'aws_ssm_parameter_store', key: '/:rdsInstances', type: 'number' },
      desiredServerCount: { system: 'aws_ssm_parameter_store', key: '/:desiredServerCount', type: 'number' },
    });
    expect(result).toBeDefined();
    console.log(result);
  });
});
