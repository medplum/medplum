import { SendEmailCommand, SESv2Client } from '@aws-sdk/client-sesv2';
import { badRequest, normalizeErrorString, OperationOutcomeError } from '@medplum/core';
import { Binary } from '@medplum/fhirtypes';
import { createTransport } from 'nodemailer';
import MailComposer from 'nodemailer/lib/mail-composer';
import Mail, { Address } from 'nodemailer/lib/mailer';
import { getConfig, MedplumSmtpConfig } from '../config';
import { Repository } from '../fhir/repo';
import { getBinaryStorage } from '../fhir/storage';
import { globalLogger } from '../logger';

/**
 * Sends an email using the AWS SES service.
 * Builds the email using nodemailer MailComposer.
 * See options here: https://nodemailer.com/extras/mailcomposer/
 * @param repo - The user repository.
 * @param options - The MailComposer options.
 */
export async function sendEmail(repo: Repository, options: Mail.Options): Promise<void> {
  const config = getConfig();
  const fromAddress = config.supportEmail;
  const toAddresses = buildAddresses(options.to);

  // Always set the from and sender to the support email address
  options.from = fromAddress;
  options.sender = fromAddress;

  // Process attachments
  // For any FHIR Binary attachments, rewrite to a stream
  await processAttachments(repo, options.attachments);

  // Disable file access
  // "if set to true then fails with an error when a node tries to load content from a file"
  options.disableFileAccess = true;

  globalLogger.info('Sending email', { to: toAddresses?.join(', '), subject: options.subject });

  if (config.smtp) {
    await sendEmailViaSmpt(config.smtp, options);
  } else {
    await sendEmailViaSes(options);
  }
}

/**
 * Converts nodemailer addresses to an array of strings.
 * @param input - nodemailer address input.
 * @returns Array of string addresses.
 */
function buildAddresses(input: string | Address | (string | Address)[] | undefined): string[] | undefined {
  if (!input) {
    return undefined;
  }
  if (Array.isArray(input)) {
    return input.map(addressToString) as string[];
  }
  return [addressToString(input) as string];
}

/**
 * Converts a nodemailer address to a string.
 * @param address - nodemailer address input.
 * @returns String address.
 */
function addressToString(address: Address | string | undefined): string | undefined {
  if (address) {
    if (typeof address === 'string') {
      return address;
    }
    if (typeof address === 'object' && 'address' in address) {
      return address.address;
    }
  }
  return undefined;
}

/**
 * Builds a raw email message using nodemailer MailComposer.
 * @param options - The nodemailer options.
 * @returns The raw email message.
 */
function buildRawMessage(options: Mail.Options): Promise<Uint8Array> {
  const msg = new MailComposer(options);
  return new Promise((resolve, reject) => {
    msg.compile().build((err, message) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(message);
    });
  });
}

/**
 * Validates an array of nodemailer attachments.
 * @param repo - The user repository.
 * @param attachments - Optional array of nodemailer attachments.
 */
async function processAttachments(repo: Repository, attachments: Mail.Attachment[] | undefined): Promise<void> {
  if (attachments) {
    for (const attachment of attachments) {
      await processAttachment(repo, attachment);
    }
  }
}

/**
 * Validates a nodemailer attachment.
 * @param repo - The user repository.
 * @param attachment - The nodemailer attachment.
 */
async function processAttachment(repo: Repository, attachment: Mail.Attachment): Promise<void> {
  // MailComposer/nodemailer has many different ways to specify attachments.
  // See: https://nodemailer.com/message/attachments/
  // We only support HTTPS URLs and embedded content.
  // The most risky case is when the attachment is a file path,
  // because nodemailer will attempt to read the file from disk.
  const path = attachment.path?.toString();
  if (!path) {
    // No path is specified, so this is probably embedded content.
    return;
  }

  if (path.startsWith('Binary/')) {
    // This is a reference to a binary resource.
    // Validate that the user can read it
    const binary = await repo.readReference<Binary>({ reference: path });

    // Then get the Readable stream from the storage service.
    attachment.content = await getBinaryStorage().readBinary(binary);

    // And then delete the original path
    delete attachment.path;
  }
}

/**
 * Sends an email via SMTP.
 * @param smtpConfig - The SMTP configuration.
 * @param options - The nodemailer options.
 */
async function sendEmailViaSmpt(smtpConfig: MedplumSmtpConfig, options: Mail.Options): Promise<void> {
  const transport = createTransport({
    host: smtpConfig.host,
    port: smtpConfig.port,
    auth: {
      user: smtpConfig.username,
      pass: smtpConfig.password,
    },
  });
  await transport.sendMail(options);
}

/**
 * Sends an email via AWS SES.
 * @param options - The nodemailer options.
 */
async function sendEmailViaSes(options: Mail.Options): Promise<void> {
  const config = getConfig();
  const fromAddress = config.supportEmail;
  const toAddresses = buildAddresses(options.to);
  const ccAddresses = buildAddresses(options.cc);
  const bccAddresses = buildAddresses(options.bcc);

  let msg: Uint8Array;
  try {
    msg = await buildRawMessage(options);
  } catch (err) {
    throw new OperationOutcomeError(badRequest('Invalid email options: ' + normalizeErrorString(err)), err);
  }

  const sesClient = new SESv2Client({ region: config.awsRegion });
  await sesClient.send(
    new SendEmailCommand({
      FromEmailAddress: fromAddress,
      Destination: {
        ToAddresses: toAddresses,
        CcAddresses: ccAddresses,
        BccAddresses: bccAddresses,
      },
      Content: {
        Raw: {
          Data: msg,
        },
      },
    })
  );
}
