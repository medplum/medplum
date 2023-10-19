export const ExternalSecretSystems = {
  aws_ssm_parameter_store: 'aws_ssm_parameter_store',
} as const;

export type ExternalSecretSystem = keyof typeof ExternalSecretSystems;

export type ExternalSecret = {
  system: ExternalSecretSystem;
  key: string;
};

export interface MedplumSourceInfraConfig {
  name: string | ExternalSecret;
  stackName: string | ExternalSecret;
  accountNumber: string | ExternalSecret;
  region: string | ExternalSecret;
  domainName: string | ExternalSecret;
  vpcId: string | ExternalSecret;
  apiPort: number | ExternalSecret;
  apiDomainName: string | ExternalSecret;
  apiSslCertArn: string | ExternalSecret;
  apiInternetFacing?: boolean | ExternalSecret;
  appDomainName: string | ExternalSecret;
  appSslCertArn: string | ExternalSecret;
  appApiProxy?: boolean | ExternalSecret;
  appLoggingBucket?: string | ExternalSecret;
  appLoggingPrefix?: string | ExternalSecret;
  storageBucketName: string | ExternalSecret;
  storageDomainName: string | ExternalSecret;
  storageSslCertArn: string | ExternalSecret;
  signingKeyId: string | ExternalSecret;
  storagePublicKey: string | ExternalSecret;
  storageLoggingBucket?: string | ExternalSecret;
  storageLoggingPrefix?: string | ExternalSecret;
  baseUrl: string | ExternalSecret;
  maxAzs: number | ExternalSecret;
  rdsInstances: number | ExternalSecret;
  rdsInstanceType: string | ExternalSecret;
  rdsSecretsArn?: string | ExternalSecret;
  cacheNodeType?: string | ExternalSecret;
  desiredServerCount: number | ExternalSecret;
  serverImage: string | ExternalSecret;
  serverMemory: number | ExternalSecret;
  serverCpu: number | ExternalSecret;
  loadBalancerLoggingBucket?: string | ExternalSecret;
  loadBalancerLoggingPrefix?: string | ExternalSecret;
  clamscanEnabled: boolean | ExternalSecret;
  clamscanLoggingBucket: string | ExternalSecret;
  clamscanLoggingPrefix: string | ExternalSecret;
  skipDns?: boolean | ExternalSecret;
  additionalContainers?: {
    name: string | ExternalSecret;
    image: string | ExternalSecret;
    cpu?: number | ExternalSecret;
    memory?: number | ExternalSecret;
    essential?: boolean | ExternalSecret;
    command?: (string | ExternalSecret)[];
    environment?: {
      [key: string]: string | ExternalSecret;
    };
  }[];
  cloudTrailAlarms?: {
    logGroupName: string | ExternalSecret;
    logGroupCreate?: boolean | ExternalSecret;
    snsTopicArn?: string | ExternalSecret;
    snsTopicName?: string | ExternalSecret;
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
