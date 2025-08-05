// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { SendEmailCommand, SESv2Client } from '@aws-sdk/client-sesv2';
import { badRequest, normalizeErrorString, OperationOutcomeError } from '@medplum/core';
import Mail from 'nodemailer/lib/mailer';
import { getConfig } from '../../config/loader';
import { addressToString, buildAddresses, buildRawMessage } from '../../email/utils';

/**
 * Sends an email via AWS SES.
 * @param options - The nodemailer options.
 */
export async function sendEmailViaSes(options: Mail.Options): Promise<void> {
  const config = getConfig();
  const fromAddress = addressToString(options.from);
  const toAddresses = buildAddresses(options.to);
  const ccAddresses = buildAddresses(options.cc);
  const bccAddresses = buildAddresses(options.bcc);
  const replyToAddresses = buildAddresses(options.replyTo);

  let msg: Uint8Array;
  try {
    msg = await buildRawMessage(options);
  } catch (err) {
    throw new OperationOutcomeError(badRequest('Invalid email options: ' + normalizeErrorString(err)), err);
  }

  const sesClient = new SESv2Client({ region: config.awsRegion });
  try {
    await sesClient.send(
      new SendEmailCommand({
        FromEmailAddress: fromAddress,
        Destination: {
          ToAddresses: toAddresses,
          CcAddresses: ccAddresses,
          BccAddresses: bccAddresses,
        },
        ReplyToAddresses: replyToAddresses,
        Content: {
          Raw: {
            Data: msg,
          },
        },
      })
    );
  } catch (err) {
    throw new OperationOutcomeError(badRequest('Error sending email: ' + normalizeErrorString(err)), err);
  }
}
