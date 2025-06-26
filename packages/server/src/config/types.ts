import { ClientApplication, ProjectSetting } from '@medplum/fhirtypes';
import { KeepJobs } from 'bullmq';

export interface MedplumServerConfig {
  port: number;
  baseUrl: string;
  issuer: string;
  jwksUrl: string;
  authorizeUrl: string;
  tokenUrl: string;
  userInfoUrl: string;
  introspectUrl: string;
  registerUrl: string;
  appBaseUrl: string;
  logLevel?: string;
  binaryStorage?: string;
  storageBaseUrl: string;
  signingKey?: string;
  signingKeyId?: string;
  signingKeyPassphrase?: string;
  supportEmail: string;
  approvedSenderEmails?: string;
  database: MedplumDatabaseConfig;
  /** @deprecated specify `database.host` and `database.ssl.require` as needed */
  databaseProxyEndpoint?: string;
  readonlyDatabase?: MedplumDatabaseConfig;
  /** @deprecated specify `readonlyDatabase.host` and `readonlyDatabase.ssl.require` as needed */
  readonlyDatabaseProxyEndpoint?: string;
  redis: MedplumRedisConfig;
  emailProvider?: 'none' | 'awsses' | 'smtp';
  smtp?: MedplumSmtpConfig;
  bullmq?: MedplumBullmqConfig;
  googleClientId?: string;
  googleClientSecret?: string;
  recaptchaSiteKey?: string;
  recaptchaSecretKey?: string;
  maxJsonSize: string;
  maxBatchSize: string;
  allowedOrigins?: string;
  awsRegion: string;
  botLambdaRoleArn: string;
  botLambdaLayerName: string;
  botCustomFunctionsEnabled?: boolean;
  logRequests?: boolean;
  logAuditEvents?: boolean;
  saveAuditEvents?: boolean;
  registerEnabled?: boolean;
  bcryptHashSalt: number;
  introspectionEnabled?: boolean;
  keepAliveTimeout?: number;
  vmContextBotsEnabled?: boolean;
  vmContextBaseUrl?: string;
  shutdownTimeoutMilliseconds?: number;
  heartbeatMilliseconds?: number;
  heartbeatEnabled?: boolean;
  accurateCountThreshold: number;
  maxSearchOffset?: number;
  defaultBotRuntimeVersion: 'awslambda' | 'vmcontext';
  defaultProjectFeatures?: (
    | 'aws-comprehend'
    | 'aws-textract'
    | 'bots'
    | 'cron'
    | 'email'
    | 'google-auth-required'
    | 'graphql-introspection'
    | 'websocket-subscriptions'
    | 'transaction-bundles'
  )[];
  defaultProjectSystemSetting?: ProjectSetting[];
  /** Number of HTTP requests per minute users can make by default; overridable by Project settings */
  defaultRateLimit?: number;
  defaultAuthRateLimit?: number;
  /** Number of FHIR interaction rate limit units per minute users can consume by default; overridable by Project settings */
  defaultFhirQuota?: number;

  /** Max length of Bot AuditEvent.outcomeDesc when creating a FHIR Resource */
  maxBotLogLengthForResource?: number;

  /** Max length of Bot AuditEvent.outcomeDesc when logging to logger */
  maxBotLogLengthForLogs?: number;

  /** Number of attempts for transactions that fail due to retry-able transaction errors */
  transactionAttempts?: number;

  /** Number of milliseconds to use as a base for exponential backoff in transaction retries */
  transactionExpBackoffBaseDelayMs?: number;

  /** Flag to enable/disable the binary storage auto-downloader service (default 'true' for enabled) */
  autoDownloadEnabled?: boolean;

  /** Flag to enable pre-commit subscriptions for the interceptor pattern (default: false) */
  preCommitSubscriptionsEnabled?: boolean;

  /** Optional list of external authentication providers. */
  externalAuthProviders?: MedplumExternalAuthConfig[];

  /** Optional list of default OAuth2 clients */
  defaultOAuthClients?: ClientApplication[];

  /** Optional flag to enable the MCP server beta */
  mcpEnabled?: boolean;

  /** @deprecated */
  auditEventLogGroup?: string;

  /** @deprecated */
  auditEventLogStream?: string;
}

/**
 * The SSL configuration for the database.
 */
export interface MedplumDatabaseSslConfig {
  ca?: string;
  key?: string;
  cert?: string;
  rejectUnauthorized?: boolean;
  require?: boolean;
}

/**
 * Based on AWS Secrets Manager for databases.
 * See: https://docs.aws.amazon.com/secretsmanager/latest/userguide/secretsmanager-userguide.pdf
 */
export interface MedplumDatabaseConfig {
  host?: string;
  port?: number;
  dbname?: string;
  username?: string;
  password?: string;
  ssl?: MedplumDatabaseSslConfig;
  queryTimeout?: number;
  runMigrations?: boolean;
  /**
   * Prevent post-deploy migrations from being automatically run after server startup.
   * Setting this to `true` is not recommended except for advanced use cases.
   */
  disableRunPostDeployMigrations?: boolean;
  maxConnections?: number;
  disableConnectionConfiguration?: boolean;
}

export interface MedplumRedisConfig {
  host?: string;
  port?: number;
  password?: string;
  /** The logical database to use for Redis. See: https://redis.io/commands/select/. Default is `0`. */
  db?: number;
  tls?: Record<string, unknown>;
}

export interface MedplumSmtpConfig {
  host: string;
  port: number;
  username: string;
  password: string;
}

export interface MedplumBullmqConfig {
  /**
   * Amount of jobs that a single worker is allowed to work on in parallel.
   * @see {@link https://docs.bullmq.io/guide/workers/concurrency}
   */
  concurrency?: number;
  removeOnComplete: KeepJobs;
  removeOnFail: KeepJobs;
}

export interface MedplumExternalAuthConfig {
  readonly issuer: string;
  readonly userInfoUrl: string;
}
