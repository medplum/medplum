import { TypeName } from './types';

export const ExternalSecretSystems = {
  aws_ssm_parameter_store: 'aws_ssm_parameter_store',
} as const;

export type ExternalSecretSystem = keyof typeof ExternalSecretSystems;
export type ExternalSecretPrimitive = string | boolean | number;
export type ExternalSecretPrimitiveType = 'string' | 'boolean' | 'number';
export type ExternalSecret<T extends ExternalSecretPrimitive = ExternalSecretPrimitive> = {
  system: ExternalSecretSystem;
  key: string;
  type: TypeName<T>;
};
export type ValueOrExternalSecret<T extends ExternalSecretPrimitive> = T | ExternalSecret<T>;
export type StringMap = { [key: string]: string };

export interface MedplumSourceInfraConfig {
  name: ValueOrExternalSecret<string>;
  stackName: ValueOrExternalSecret<string>;
  accountNumber: ValueOrExternalSecret<string>;
  region: string;
  domainName: ValueOrExternalSecret<string>;
  vpcId: ValueOrExternalSecret<string>;
  apiPort: ValueOrExternalSecret<number>;
  apiDomainName: ValueOrExternalSecret<string>;
  apiSslCertArn: ValueOrExternalSecret<string>;
  apiInternetFacing?: ValueOrExternalSecret<boolean>;
  apiWafIpSetArn: ValueOrExternalSecret<string>;
  appDomainName: ValueOrExternalSecret<string>;
  appSslCertArn: ValueOrExternalSecret<string>;
  appApiProxy?: ValueOrExternalSecret<boolean>;
  appWafIpSetArn: ValueOrExternalSecret<string>;
  appLoggingBucket?: ValueOrExternalSecret<string>;
  appLoggingPrefix?: ValueOrExternalSecret<string>;
  storageBucketName: ValueOrExternalSecret<string>;
  storageDomainName: ValueOrExternalSecret<string>;
  storageSslCertArn: ValueOrExternalSecret<string>;
  signingKeyId: ValueOrExternalSecret<string>;
  storagePublicKey: ValueOrExternalSecret<string>;
  storageWafIpSetArn: ValueOrExternalSecret<string>;
  storageLoggingBucket?: ValueOrExternalSecret<string>;
  storageLoggingPrefix?: ValueOrExternalSecret<string>;
  baseUrl: ValueOrExternalSecret<string>;
  maxAzs: ValueOrExternalSecret<number>;
  rdsInstances: ValueOrExternalSecret<number>;
  rdsInstanceType: ValueOrExternalSecret<string>;
  rdsInstanceVersion?: ValueOrExternalSecret<string>;
  rdsSecretsArn?: ValueOrExternalSecret<string>;
  rdsReaderInstanceType?: ValueOrExternalSecret<string>;
  rdsProxyEnabled?: ValueOrExternalSecret<boolean>;
  cacheNodeType?: ValueOrExternalSecret<string>;
  cacheSecurityGroupId?: ValueOrExternalSecret<string>;
  desiredServerCount: ValueOrExternalSecret<number>;
  serverImage: ValueOrExternalSecret<string>;
  serverMemory: ValueOrExternalSecret<number>;
  serverCpu: ValueOrExternalSecret<number>;
  loadBalancerSecurityGroupId?: ValueOrExternalSecret<string>;
  loadBalancerLoggingBucket?: ValueOrExternalSecret<string>;
  loadBalancerLoggingPrefix?: ValueOrExternalSecret<string>;
  clamscanEnabled: ValueOrExternalSecret<boolean>;
  clamscanLoggingBucket: ValueOrExternalSecret<string>;
  clamscanLoggingPrefix: ValueOrExternalSecret<string>;
  skipDns?: ValueOrExternalSecret<boolean>;
  hostedZoneName?: ValueOrExternalSecret<string>;
  additionalContainers?: {
    name: ValueOrExternalSecret<string>;
    image: ValueOrExternalSecret<string>;
    cpu?: ValueOrExternalSecret<number>;
    memory?: ValueOrExternalSecret<number>;
    essential?: ValueOrExternalSecret<boolean>;
    command?: ValueOrExternalSecret<string>[];
    environment?: {
      [key: string]: ValueOrExternalSecret<string>;
    };
  }[];
  containerInsights?: ValueOrExternalSecret<boolean>;
  cloudTrailAlarms?: {
    logGroupName: ValueOrExternalSecret<string>;
    logGroupCreate?: ValueOrExternalSecret<boolean>;
    snsTopicArn?: ValueOrExternalSecret<string>;
    snsTopicName?: ValueOrExternalSecret<string>;
  };
  fargateAutoScaling?: {
    minCapacity: ValueOrExternalSecret<number>;
    maxCapacity: ValueOrExternalSecret<number>;
    targetUtilizationPercent: ValueOrExternalSecret<number>;
    scaleInCooldown: ValueOrExternalSecret<number>;
    scaleOutCooldown: ValueOrExternalSecret<number>;
  };
  environment?: StringMap;
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
  apiWafIpSetArn?: string;
  appDomainName: string;
  appSslCertArn: string;
  appApiProxy?: boolean;
  appWafIpSetArn?: string;
  appLoggingBucket?: string;
  appLoggingPrefix?: string;
  storageBucketName: string;
  storageDomainName: string;
  storageSslCertArn: string;
  signingKeyId: string;
  storagePublicKey: string;
  storageWafIpSetArn?: string;
  storageLoggingBucket?: string;
  storageLoggingPrefix?: string;
  baseUrl: string;
  maxAzs: number;
  rdsInstances: number;
  rdsInstanceType: string;
  rdsInstanceVersion?: string;
  rdsSecretsArn?: string;
  rdsReaderInstanceType?: string;
  rdsProxyEnabled?: boolean;
  cacheNodeType?: string;
  cacheSecurityGroupId?: string;
  desiredServerCount: number;
  serverImage: string;
  serverMemory: number;
  serverCpu: number;
  loadBalancerSecurityGroupId?: string;
  loadBalancerLoggingBucket?: string;
  loadBalancerLoggingPrefix?: string;
  clamscanEnabled: boolean;
  clamscanLoggingBucket: string;
  clamscanLoggingPrefix: string;
  skipDns?: boolean;
  hostedZoneName?: string;
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
  containerInsights?: boolean;
  cloudTrailAlarms?: {
    logGroupName: string;
    logGroupCreate?: boolean;
    snsTopicArn?: string;
    snsTopicName?: string;
  };
  fargateAutoScaling?: {
    minCapacity: number;
    maxCapacity: number;
    targetUtilizationPercent: number;
    scaleInCooldown: number;
    scaleOutCooldown: number;
  };
  environment?: StringMap;
}
