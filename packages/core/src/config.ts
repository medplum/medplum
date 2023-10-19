export const ExternalSecretSystems = {
  aws_ssm_parameter_store: 'aws_ssm_parameter_store',
} as const;

export type ExternalSecretSystem = keyof typeof ExternalSecretSystems;

export type ExternalSecret<T extends 'string' | 'number' | 'boolean'> = {
  system: ExternalSecretSystem;
  key: string;
  type: T;
};

export interface MedplumSourceInfraConfig {
  name: string | ExternalSecret<'string'>;
  stackName: string | ExternalSecret<'string'>;
  accountNumber: string | ExternalSecret<'string'>;
  region: string | ExternalSecret<'string'>;
  domainName: string | ExternalSecret<'string'>;
  vpcId: string | ExternalSecret<'string'>;
  apiPort: number | ExternalSecret<'number'>;
  apiDomainName: string | ExternalSecret<'string'>;
  apiSslCertArn: string | ExternalSecret<'string'>;
  apiInternetFacing?: boolean | ExternalSecret<'boolean'>;
  appDomainName: string | ExternalSecret<'string'>;
  appSslCertArn: string | ExternalSecret<'string'>;
  appApiProxy?: boolean | ExternalSecret<'boolean'>;
  appLoggingBucket?: string | ExternalSecret<'string'>;
  appLoggingPrefix?: string | ExternalSecret<'string'>;
  storageBucketName: string | ExternalSecret<'string'>;
  storageDomainName: string | ExternalSecret<'string'>;
  storageSslCertArn: string | ExternalSecret<'string'>;
  signingKeyId: string | ExternalSecret<'string'>;
  storagePublicKey: string | ExternalSecret<'string'>;
  storageLoggingBucket?: string | ExternalSecret<'string'>;
  storageLoggingPrefix?: string | ExternalSecret<'string'>;
  baseUrl: string | ExternalSecret<'string'>;
  maxAzs: number | ExternalSecret<'number'>;
  rdsInstances: number | ExternalSecret<'number'>;
  rdsInstanceType: string | ExternalSecret<'string'>;
  rdsSecretsArn?: string | ExternalSecret<'string'>;
  cacheNodeType?: string | ExternalSecret<'string'>;
  desiredServerCount: number | ExternalSecret<'number'>;
  serverImage: string | ExternalSecret<'string'>;
  serverMemory: number | ExternalSecret<'number'>;
  serverCpu: number | ExternalSecret<'number'>;
  loadBalancerLoggingBucket?: string | ExternalSecret<'string'>;
  loadBalancerLoggingPrefix?: string | ExternalSecret<'string'>;
  clamscanEnabled: boolean | ExternalSecret<'boolean'>;
  clamscanLoggingBucket: string | ExternalSecret<'string'>;
  clamscanLoggingPrefix: string | ExternalSecret<'string'>;
  skipDns?: boolean | ExternalSecret<'boolean'>;
  additionalContainers?: {
    name: string | ExternalSecret<'string'>;
    image: string | ExternalSecret<'string'>;
    cpu?: number | ExternalSecret<'number'>;
    memory?: number | ExternalSecret<'number'>;
    essential?: boolean | ExternalSecret<'boolean'>;
    command?: (string | ExternalSecret<'string'>)[];
    environment?: {
      [key: string]: string | ExternalSecret<'string'>;
    };
  }[];
  cloudTrailAlarms?: {
    logGroupName: string | ExternalSecret<'string'>;
    logGroupCreate?: boolean | ExternalSecret<'boolean'>;
    snsTopicArn?: string | ExternalSecret<'string'>;
    snsTopicName?: string | ExternalSecret<'string'>;
  };
}

export interface MedplumInfraConfig {
  name: string;
  stackName: string;
  accountNumber: string;
  region: string;
  domainName: string;
  vpcId: string;
  apiPort: number;
  apiDomainName: string;
  apiSslCertArn: string;
  apiInternetFacing?: boolean;
  appDomainName: string;
  appSslCertArn: string;
  appApiProxy?: boolean;
  appLoggingBucket?: string;
  appLoggingPrefix?: string;
  storageBucketName: string;
  storageDomainName: string;
  storageSslCertArn: string;
  signingKeyId: string;
  storagePublicKey: string;
  storageLoggingBucket?: string;
  storageLoggingPrefix?: string;
  baseUrl: string;
  maxAzs: number;
  rdsInstances: number;
  rdsInstanceType: string;
  rdsSecretsArn?: string;
  cacheNodeType?: string;
  desiredServerCount: number;
  serverImage: string;
  serverMemory: number;
  serverCpu: number;
  loadBalancerLoggingBucket?: string;
  loadBalancerLoggingPrefix?: string;
  clamscanEnabled: boolean;
  clamscanLoggingBucket: string;
  clamscanLoggingPrefix: string;
  skipDns?: boolean;
  additionalContainers?: {
    name: string;
    image: string;
    cpu?: number;
    memory?: number;
    essential?: boolean;
    command?: string[];
    environment?: {
      [key: string]: string;
    };
  }[];
  cloudTrailAlarms?: {
    logGroupName: string;
    logGroupCreate?: boolean;
    snsTopicArn?: string;
    snsTopicName?: string;
  };
}
