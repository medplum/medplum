import { SendEmailCommand, SESv2Client } from '@aws-sdk/client-sesv2';
import { getConfig } from './config';
import { logger } from './logger';

export async function sendEmail(toAddresses: string[], subject: string, body: string): Promise<void> {
  const sesClient = new SESv2Client({ region: 'us-east-1' });
  logger.info(`Sending email to ${toAddresses.join(', ')} subject "${subject}"`);
  await sesClient.send(
    new SendEmailCommand({
      FromEmailAddress: getConfig().supportEmail,
      Destination: {
        ToAddresses: toAddresses,
      },
      Content: {
        Simple: {
          Subject: {
            Data: subject,
          },
          Body: {
            Text: {
              Data: body,
            },
          },
        },
      },
    })
  );
}
