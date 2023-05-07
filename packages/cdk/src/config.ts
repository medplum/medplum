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
  appDomainName: string;
  appSslCertArn: string;
  storageBucketName: string;
  storageDomainName: string;
  storageSslCertArn: string;
  storagePublicKey: string;
  maxAzs: number;
  rdsInstances: number;
  rdsInstanceType: string;
  rdsSecretsArn?: string;
  desiredServerCount: number;
  serverImage: string;
  serverMemory: number;
  serverCpu: number;
  loadBalancerLoggingEnabled: boolean;
  loadBalancerLoggingBucket: string;
  loadBalancerLoggingPrefix: string;
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
}
