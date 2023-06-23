import { SendEmailCommand, SESv2Client } from '@aws-sdk/client-sesv2';
import MailComposer from 'nodemailer/lib/mail-composer';
import Mail, { Address } from 'nodemailer/lib/mailer';
import { getConfig } from '../config';
import { systemRepo } from '../fhir/repo';
import { rewriteAttachments, RewriteMode } from '../fhir/rewrite';
import { logger } from '../logger';

/**
 * Sends an email using the AWS SES service.
 * Builds the email using nodemailer MailComposer.
 * See options here: https://nodemailer.com/extras/mailcomposer/
 * @param options The MailComposer options.
 */
export async function sendEmail(options: Mail.Options): Promise<void> {
  const sesClient = new SESv2Client({ region: getConfig().awsRegion });
  const fromAddress = getConfig().supportEmail;
  const toAddresses = buildAddresses(options.to);
  const ccAddresses = buildAddresses(options.cc);
  const bccAddresses = buildAddresses(options.bcc);
  logger.info(`Sending email to ${toAddresses?.join(', ')} subject "${options.subject}"`);

  const msg = await buildRawMessage(
    await rewriteAttachments(RewriteMode.PRESIGNED_URL, systemRepo, {
      ...options,
      from: fromAddress,
      sender: fromAddress,
    })
  );

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

function buildAddresses(input: string | Address | (string | Address)[] | undefined): string[] | undefined {
  if (!input) {
    return undefined;
  }
  if (Array.isArray(input)) {
    return input.map(addressToString) as string[];
  }
  return [addressToString(input) as string];
}

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
