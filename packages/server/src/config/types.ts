import { KeepJobs } from 'bullmq';

export interface MedplumServerConfig {
  port: number;
  baseUrl: string;
  issuer: string;
  jwksUrl: string;
  authorizeUrl: string;
  tokenUrl: string;
  userInfoUrl: string;
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
  databaseProxyEndpoint?: string;
  readonlyDatabase?: MedplumDatabaseConfig;
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
    | 'email'
    | 'bots'
    | 'cron'
    | 'google-auth-required'
    | 'graphql-introspection'
    | 'terminology'
    | 'websocket-subscriptions'
  )[];
  defaultRateLimit?: number;
  defaultAuthRateLimit?: number;

  /** Max length of Bot AuditEvent.outcomeDesc when creating a FHIR Resource */
  maxBotLogLengthForResource?: number;

  /** Max length of Bot AuditEvent.outcomeDesc when logging to logger */
  maxBotLogLengthForLogs?: number;

  /** Temporary feature flag, to be removed */
  chainedSearchWithReferenceTables?: boolean;

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
