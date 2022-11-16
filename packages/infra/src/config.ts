export interface MedplumInfraConfig {
  readonly name: string;
  readonly stackName: string;
  readonly accountNumber: string;
  readonly region: string;
  readonly domainName: string;
  readonly apiPort: number;
  readonly apiDomainName: string;
  readonly apiSslCertArn: string;
  readonly appDomainName: string;
  readonly appSslCertArn: string;
  readonly storageBucketName: string;
  readonly storageDomainName: string;
  readonly storageSslCertArn: string;
  readonly storagePublicKey: string;
  readonly maxAzs: number;
  readonly rdsInstances: number;
  readonly desiredServerCount: number;
  readonly serverImage: string;
  readonly serverMemory: number;
  readonly serverCpu: number;
  readonly loadBalancerLoggingEnabled: boolean;
  readonly loadBalancerLoggingBucket: string;
  readonly loadBalancerLoggingPrefix: string;
  readonly clamscanEnabled: boolean;
  readonly clamscanLoggingBucket: string;
  readonly clamscanLoggingPrefix: string;
}
