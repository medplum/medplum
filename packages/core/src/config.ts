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
