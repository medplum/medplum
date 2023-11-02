import { ACMClient, CertificateSummary, ListCertificatesCommand, RequestCertificateCommand } from '@aws-sdk/client-acm';
import { CloudFrontClient, CreatePublicKeyCommand } from '@aws-sdk/client-cloudfront';
import { GetParameterCommand, PutParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import { GetCallerIdentityCommand, STSClient } from '@aws-sdk/client-sts';
import { MedplumInfraConfig } from '@medplum/core';
import { generateKeyPairSync, randomUUID } from 'crypto';
import { existsSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import readline from 'readline';

type MedplumDomainType = 'api' | 'app' | 'storage';
type MedplumDomainSetting = `${MedplumDomainType}DomainName`;
type MedplumDomainCertSetting = `${MedplumDomainType}SslCertArn`;

const getDomainSetting = (domain: MedplumDomainType): MedplumDomainSetting => `${domain}DomainName`;
const getDomainCertSetting = (domain: MedplumDomainType): MedplumDomainCertSetting => `${domain}SslCertArn`;

let terminal: readline.Interface;

export async function initStackCommand(): Promise<void> {
  const config = { apiPort: 8103, region: 'us-east-1' } as MedplumInfraConfig;
  terminal = readline.createInterface({ input: process.stdin, output: process.stdout });
  header('MEDPLUM');
  print('This tool prepares the necessary prerequisites for deploying Medplum in your AWS account.');
  print('');
  print('Most Medplum infrastructure is deployed using the AWS CDK.');
  print('However, some AWS resources must be created manually, such as email addresses and SSL certificates.');
  print('This tool will help you create those resources.');
  print('');
  print('Upon completion, this tool will:');
  print('  1. Generate a Medplum CDK config file (i.e., medplum.demo.config.json)');
  print('  2. Optionally generate an AWS CloudFront signing key');
  print('  3. Optionally request SSL certificates from AWS Certificate Manager');
  print('  4. Optionally write server config settings to AWS Parameter Store');
  print('');
  print('The Medplum infra config file is an input to the Medplum CDK.');
  print('The Medplum CDK will create and manage the necessary AWS resources.');
  print('');
  print('We will ask a series of questions to generate your infra config file.');
  print('Some questions have predefined options in [square brackets].');
  print('Some questions have default values in (parentheses), which you can accept by pressing Enter.');
  print('Press Ctrl+C at any time to exit.');

  const currentAccountId = await getAccountId(config.region);
  if (!currentAccountId) {
    print('It appears that you do not have AWS credentials configured.');
    print('AWS credentials are not strictly required, but will enable some additional features.');
    print('If you intend to use AWS credentials, please configure them now.');
    await checkOk('Do you want to continue without AWS credentials?');
  }

  header('ENVIRONMENT NAME');
  print('Medplum deployments have a short environment name such as "prod", "staging", "alice", or "demo".');
  print('The environment name is used in multiple places:');
  print('  1. As part of config file names (i.e., medplum.demo.config.json)');
  print('  2. As the base of CloudFormation stack names (i.e., MedplumDemo)');
  print('  3. AWS Parameter Store keys (i.e., /medplum/demo/...)');
  config.name = await ask('What is your environment name?', 'demo');
  print('Using environment name "' + config.name + '"...');

  header('CONFIG FILE');
  print('Medplum Infrastructure will create a config file in the current directory.');
  const configFileName = await ask('What is the config file name?', `medplum.${config.name}.config.json`);
  if (existsSync(configFileName)) {
    print('Config file already exists.');
    await checkOk('Do you want to overwrite the config file?');
  }
  print('Using config file "' + configFileName + '"...');
  writeConfig(configFileName, config);

  header('AWS REGION');
  print('Most Medplum resources will be created in a single AWS region.');
  config.region = await ask('Enter your AWS region:', 'us-east-1');
  writeConfig(configFileName, config);

  header('AWS ACCOUNT NUMBER');
  print('Medplum Infrastructure will use your AWS account number to create AWS resources.');
  if (currentAccountId) {
    print('Using the AWS CLI, your current account ID is: ' + currentAccountId);
  }
  config.accountNumber = await ask('What is your AWS account number?', currentAccountId);
  writeConfig(configFileName, config);

  header('STACK NAME');
  print('Medplum will create a CloudFormation stack to manage AWS resources.');
  print('AWS CloudFormation stack names ');
  const defaultStackName = 'Medplum' + config.name.charAt(0).toUpperCase() + config.name.slice(1);
  config.stackName = await ask('Enter your CloudFormation stack name?', defaultStackName);
  writeConfig(configFileName, config);

  header('BASE DOMAIN NAME');
  print('Please enter the base domain name for your Medplum deployment.');
  print('');
  print('Medplum deploys multiple subdomains for various services.');
  print('');
  print('For example, "api." for the REST API and "app." for the web application.');
  print('The base domain name is the common suffix for all subdomains.');
  print('');
  print('For example, if your base domain name is "example.com",');
  print('then the REST API will be "api.example.com".');
  print('');
  print('The base domain should include the TLD (i.e., ".com", ".org", ".net").');
  print('');
  print('Note that you must own the base domain, and it must use Route53 DNS.');
  while (!config.domainName) {
    config.domainName = await ask('Enter your base domain name:');
  }
  writeConfig(configFileName, config);

  header('SUPPORT EMAIL');
  print('Medplum sends transactional emails to users.');
  print('For example, emails to new users or for password reset.');
  print('Medplum will use the support email address to send these emails.');
  print('Note that you must verify the support email address in SES.');
  const supportEmail = await ask('Enter your support email address:');

  header('API DOMAIN NAME');
  print('Medplum deploys a REST API for the backend services.');
  config.apiDomainName = await ask('Enter your REST API domain name:', 'api.' + config.domainName);
  config.baseUrl = `https://${config.apiDomainName}/`;
  writeConfig(configFileName, config);

  header('APP DOMAIN NAME');
  print('Medplum deploys a web application for the user interface.');
  config.appDomainName = await ask('Enter your web application domain name:', 'app.' + config.domainName);
  writeConfig(configFileName, config);

  header('STORAGE DOMAIN NAME');
  print('Medplum deploys a storage service for file uploads.');
  config.storageDomainName = await ask('Enter your storage domain name:', 'storage.' + config.domainName);
  writeConfig(configFileName, config);

  header('STORAGE BUCKET');
  print('Medplum uses an S3 bucket to store binary content such as file uploads.');
  print('Medplum will create a the S3 bucket as part of the CloudFormation stack.');
  config.storageBucketName = await ask('Enter your storage bucket name:', config.storageDomainName);
  writeConfig(configFileName, config);

  header('MAX AVAILABILITY ZONES');
  print('Medplum API servers can be deployed in multiple availability zones.');
  print('This provides redundancy and high availability.');
  print('However, it also increases the cost of the deployment.');
  print('If you want to use all availability zones, choose a large number such as 99.');
  print('If you want to restrict the number, for example to manage EIP limits,');
  print('then choose a small number such as 1 or 2.');
  config.maxAzs = await chooseInt('Enter the maximum number of availability zones:', [1, 2, 3, 99], 2);

  header('DATABASE INSTANCES');
  print('Medplum uses a relational database to store data.');
  print('You can set up your own database,');
  print('or Medplum can create a new RDS database as part of the CloudFormation stack.');
  if (await yesOrNo('Do you want to create a new RDS database as part of the CloudFormation stack?')) {
    print('Medplum will create a new RDS database as part of the CloudFormation stack.');
    print('');
    print('If you need high availability, you can choose multiple instances.');
    print('Use 1 for a single instance, or 2 for a primary and a standby.');
    config.rdsInstances = await chooseInt('Enter the number of database instances:', [1, 2], 1);
  } else {
    print('Medplum will not create a new RDS database.');
    print('Please create a new RDS database and enter the database name, username, and password.');
    print('Set the AWS Secrets Manager secret ARN in the config file in the "rdsSecretsArn" setting.');
    config.rdsSecretsArn = 'TODO';
  }
  writeConfig(configFileName, config);

  header('SERVER INSTANCES');
  print('Medplum uses AWS Fargate to run the API servers.');
  print('Medplum will create a new Fargate cluster as part of the CloudFormation stack.');
  print('Fargate will automatically scale the number of servers up and down.');
  print('If you need high availability, you can choose multiple instances.');
  config.desiredServerCount = await chooseInt('Enter the number of server instances:', [1, 2, 3, 4, 6, 8], 1);
  writeConfig(configFileName, config);

  header('SERVER MEMORY');
  print('You can choose the amount of memory for each server instance.');
  print('The default is 512 MB, which is sufficient for getting started.');
  print('Note that only certain CPU units are compatible with memory units.');
  print('Consult AWS Fargate "Task Definition Parameters" for more information.');
  config.serverMemory = await chooseInt('Enter the server memory (MB):', [512, 1024, 2048, 4096, 8192, 16384], 512);
  writeConfig(configFileName, config);

  header('SERVER CPU');
  print('You can choose the amount of CPU for each server instance.');
  print('CPU is expressed as an integer using AWS CPU units');
  print('The default is 256, which is sufficient for getting started.');
  print('Note that only certain CPU units are compatible with memory units.');
  print('Consult AWS Fargate "Task Definition Parameters" for more information.');
  config.serverCpu = await chooseInt('Enter the server CPU:', [256, 512, 1024, 2048, 4096, 8192, 16384], 256);
  writeConfig(configFileName, config);

  header('SERVER IMAGE');
  print('Medplum uses Docker images for the API servers.');
  print('You can choose the image to use for the servers.');
  print('Docker images can be loaded from either Docker Hub or AWS ECR.');
  print('The default is the latest Medplum release.');
  config.serverImage = await ask('Enter the server image:', 'medplum/medplum-server:latest');
  writeConfig(configFileName, config);

  header('SIGNING KEY');
  print('Medplum uses AWS CloudFront Presigned URLs for binary content such as file uploads.');
  const { keyId, privateKey, publicKey, passphrase } = await generateSigningKey(config.stackName + 'SigningKey');
  config.signingKeyId = keyId;
  config.storagePublicKey = publicKey;
  writeConfig(configFileName, config);

  header('SSL CERTIFICATES');
  print(`Medplum will now check for existing SSL certificates for the subdomains.`);
  const allCerts = await listAllCertificates(config.region);
  print('Found ' + allCerts.length + ' certificate(s).');

  // Process certificates for each subdomain
  // Note: The "api" certificate must be created in the same region as the API
  // Note: The "app" and "storage" certificates must be created in us-east-1
  for (const { region, certName } of [
    { region: config.region, certName: 'api' },
    { region: 'us-east-1', certName: 'app' },
    { region: 'us-east-1', certName: 'storage' },
  ] as const) {
    print('');
    const arn = await processCert(config, allCerts, region, certName);
    config[getDomainCertSetting(certName)] = arn;
    writeConfig(configFileName, config);
  }

  header('AWS PARAMETER STORE');
  print('Medplum uses AWS Parameter Store to store sensitive configuration values.');
  print('These values will be encrypted at rest.');
  print(`The values will be stored in the "/medplum/${config.name}" path.`);

  const serverParams = {
    port: config.apiPort,
    baseUrl: config.baseUrl,
    appBaseUrl: `https://${config.appDomainName}/`,
    storageBaseUrl: `https://${config.storageDomainName}/binary/`,
    binaryStorage: `s3:${config.storageBucketName}`,
    signingKeyId: config.signingKeyId,
    signingKey: privateKey,
    signingKeyPassphrase: passphrase,
    supportEmail: supportEmail,
  };

  print(
    JSON.stringify(
      {
        ...serverParams,
        signingKey: '****',
        signingKeyPassphrase: '****',
      },
      null,
      2
    )
  );

  await checkOk('Do you want to store these values in AWS Parameter Store?');
  await writeParameters(config.region, `/medplum/${config.name}/`, serverParams);

  header('DONE!');
  print('Medplum configuration complete.');
  print('You can now proceed to deploying the Medplum infrastructure with CDK.');
  print('Run:');
  print('');
  print(`    npx cdk bootstrap -c config=${configFileName}`);
  print(`    npx cdk synth -c config=${configFileName}`);
  if (config.region === 'us-east-1') {
    print(`    npx cdk deploy -c config=${configFileName}`);
  } else {
    print(`    npx cdk deploy -c config=${configFileName} --all`);
  }
  print('');
  print('See Medplum documentation for more information:');
  print('');
  print('    https://www.medplum.com/docs/self-hosting/install-on-aws');
  print('');
  terminal.close();
}

/**
 * Prints to stdout.
 * @param text The text to print.
 */
function print(text: string): void {
  terminal.write(text + '\n');
}

/**
 * Prints a header with extra line spacing.
 * @param text The text to print.
 */
function header(text: string): void {
  print('\n' + text + '\n');
}

/**
 * Prints a question and waits for user input.
 * @param text The question text to print.
 * @param defaultValue Optional default value.
 * @returns The selected value, or default value on empty selection.
 */
function ask(text: string, defaultValue: string | number = ''): Promise<string> {
  return new Promise((resolve) => {
    terminal.question(text + (defaultValue ? ' (' + defaultValue + ')' : '') + ' ', (answer: string) => {
      resolve(answer || defaultValue.toString());
    });
  });
}

/**
 * Prints a question and waits for user to choose one of the provided options.
 * @param text The prompt text to print.
 * @param options The list of options that the user can select.
 * @param defaultValue Optional default value.
 * @returns The selected value, or default value on empty selection.
 */
async function choose(text: string, options: (string | number)[], defaultValue = ''): Promise<string> {
  const str = text + ' [' + options.map((o) => (o === defaultValue ? '(' + o + ')' : o)).join('|') + ']';
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const answer = (await ask(str)) || defaultValue;
    if (options.includes(answer)) {
      return answer;
    }
    print('Please choose one of the following options: ' + options.join(', '));
  }
}

/**
 * Prints a question and waits for the user to choose a valid integer option.
 * @param text The prompt text to print.
 * @param options The list of options that the user can select.
 * @param defaultValue Default value.
 * @returns The selected value, or default value on empty selection.
 */
async function chooseInt(text: string, options: number[], defaultValue: number): Promise<number> {
  return parseInt(
    await choose(
      text,
      options.map((o) => o.toString()),
      defaultValue.toString()
    ),
    10
  );
}

/**
 * Prints a question and waits for the user to choose yes or no.
 * @param text The question to print.
 * @returns true on accept or false on reject.
 */
async function yesOrNo(text: string): Promise<boolean> {
  return (await choose(text, ['y', 'n'])).toLowerCase() === 'y';
}

/**
 * Prints a question and waits for the user to confirm yes. Throws error on no, and exits the program.
 * @param text The prompt text to print.
 */
async function checkOk(text: string): Promise<void> {
  if (!(await yesOrNo(text))) {
    print('Exiting...');
    throw new Error('User cancelled');
  }
}

/**
 * Writes a config file to disk.
 * @param configFileName The config file name.
 * @param config The config file contents.
 */
function writeConfig(configFileName: string, config: MedplumInfraConfig): void {
  writeFileSync(resolve(configFileName), JSON.stringify(config, undefined, 2), 'utf-8');
}

/**
 * Returns the current AWS account ID.
 * This is used as the default value for the "accountNumber" config setting.
 * @param region The AWS region.
 * @returns The AWS account ID.
 */
async function getAccountId(region: string): Promise<string | undefined> {
  try {
    const client = new STSClient({ region });
    const command = new GetCallerIdentityCommand({});
    const response = await client.send(command);
    return response.Account as string;
  } catch (err) {
    console.log('Warning: Unable to get AWS account ID', (err as Error).message);
    return undefined;
  }
}

/**
 * Returns a list of all AWS certificates.
 * This is used to find existing certificates for the subdomains.
 * If the primary region is not us-east-1, then certificates in us-east-1 will also be returned.
 * @param region The AWS region.
 * @returns The list of AWS Certificates.
 */
async function listAllCertificates(region: string): Promise<CertificateSummary[]> {
  const result = await listCertificates(region);
  if (region !== 'us-east-1') {
    const usEast1Result = await listCertificates('us-east-1');
    result.push(...usEast1Result);
  }
  return result;
}

/**
 * Returns a list of AWS Certificates.
 * This is used to find existing certificates for the subdomains.
 * @param region The AWS region.
 * @returns The list of AWS Certificates.
 */
async function listCertificates(region: string): Promise<CertificateSummary[]> {
  try {
    const client = new ACMClient({ region });
    const command = new ListCertificatesCommand({ MaxItems: 1000 });
    const response = await client.send(command);
    return response.CertificateSummaryList as CertificateSummary[];
  } catch (err) {
    console.log('Warning: Unable to list certificates', (err as Error).message);
    return [];
  }
}

/**
 * Processes a required certificate.
 *
 * 1. If the certificate already exists, return the ARN.
 * 2. If the certificate does not exist, and the user wants to create a new certificate, create it and return the ARN.
 * 3. If the certificate does not exist, and the user does not want to create a new certificate, return a placeholder.
 * @param config In-progress config settings.
 * @param allCerts List of all existing certificates.
 * @param region The AWS region where the certificate is needed.
 * @param certName The name of the certificate (api, app, or storage).
 * @returns The ARN of the certificate or placeholder if a new certificate is needed.
 */
async function processCert(
  config: MedplumInfraConfig,
  allCerts: CertificateSummary[],
  region: string,
  certName: 'api' | 'app' | 'storage'
): Promise<string> {
  const domainName = config[getDomainSetting(certName)];
  const existingCert = allCerts.find((cert) => cert.CertificateArn?.includes(region) && cert.DomainName === domainName);
  if (existingCert) {
    print(`Found existing certificate for "${domainName}" in "${region}.`);
    return existingCert.CertificateArn as string;
  }

  print(`No existing certificate found for "${domainName}" in "${region}.`);
  if (!(await yesOrNo('Do you want to request a new certificate?'))) {
    print(`Please add your certificate ARN to the config file in the "${getDomainCertSetting(certName)}" setting.`);
    return 'TODO';
  }

  const arn = await requestCert(region, domainName);
  print('Certificate ARN: ' + arn);
  return arn;
}

/**
 * Requests an AWS Certificate.
 * @param region The AWS region.
 * @param domain The domain name.
 * @returns The AWS Certificate ARN on success, or undefined on failure.
 */
async function requestCert(region: string, domain: string): Promise<string> {
  try {
    const validationMethod = await choose(
      'Validate certificate using DNS or email validation?',
      ['dns', 'email'],
      'dns'
    );
    const client = new ACMClient({ region });
    const command = new RequestCertificateCommand({
      DomainName: domain,
      ValidationMethod: validationMethod.toUpperCase(),
    });
    const response = await client.send(command);
    return response.CertificateArn as string;
  } catch (err) {
    console.log('Error: Unable to request certificate', (err as Error).message);
    return 'TODO';
  }
}

/**
 * Generates an AWS CloudFront signing key.
 *
 * Requirements:
 *
 *   1. It must be an SSH-2 RSA key pair.
 *   2. It must be in base64-encoded PEM format.
 *   3. It must be a 2048-bit key pair.
 *
 * See: https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-trusted-signers.html#private-content-creating-cloudfront-key-pairs
 * @param keyName The key name.
 * @returns A new signing key.
 */
async function generateSigningKey(keyName: string): Promise<{
  keyId: string;
  publicKey: string;
  privateKey: string;
  passphrase: string;
}> {
  const passphrase = randomUUID();
  const signingKey = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: {
      type: 'spki',
      format: 'pem',
    },
    privateKeyEncoding: {
      type: 'pkcs1',
      format: 'pem',
      cipher: 'aes-256-cbc',
      passphrase,
    },
  });

  const response = await new CloudFrontClient({}).send(
    new CreatePublicKeyCommand({
      PublicKeyConfig: {
        Name: keyName,
        CallerReference: randomUUID(),
        EncodedKey: signingKey.publicKey,
      },
    })
  );

  return {
    keyId: response.PublicKey?.Id as string,
    publicKey: signingKey.publicKey,
    privateKey: signingKey.privateKey,
    passphrase,
  };
}

/**
 * Reads a parameter from AWS Parameter Store.
 * @param client The AWS SSM client.
 * @param name The parameter name.
 * @returns The parameter value, or undefined if not found.
 */
async function readParameter(client: SSMClient, name: string): Promise<string | undefined> {
  const command = new GetParameterCommand({
    Name: name,
    WithDecryption: true,
  });
  try {
    const result = await client.send(command);
    return result.Parameter?.Value;
  } catch (err: any) {
    if (err.name === 'ParameterNotFound') {
      return undefined;
    }
    throw err;
  }
}

/**
 * Writes a parameter to AWS Parameter Store.
 * @param client The AWS SSM client.
 * @param name The parameter name.
 * @param value The parameter value.
 */
async function writeParameter(client: SSMClient, name: string, value: string): Promise<void> {
  const command = new PutParameterCommand({
    Name: name,
    Value: value,
    Type: 'SecureString',
    Overwrite: true,
  });
  await client.send(command);
}

/**
 * Writes a collection of parameters to AWS Parameter Store.
 * @param region The AWS region.
 * @param prefix The AWS Parameter Store prefix.
 * @param params The parameters to write.
 */
async function writeParameters(region: string, prefix: string, params: Record<string, string | number>): Promise<void> {
  const client = new SSMClient({ region });
  for (const [key, value] of Object.entries(params)) {
    const name = prefix + key;
    const valueStr = value.toString();
    const existingValue = await readParameter(client, name);

    if (existingValue !== undefined && existingValue !== valueStr) {
      print(`Parameter "${name}" exists with different value.`);
      await checkOk(`Do you want to overwrite "${name}"?`);
    }

    await writeParameter(client, name, valueStr);
  }
}
