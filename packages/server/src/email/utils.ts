// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import MailComposer from 'nodemailer/lib/mail-composer';
import Mail, { Address } from 'nodemailer/lib/mailer';
import { getConfig } from '../config/loader';
import { getLogger } from '../logger';

/**
 * Returns the from address to use.
 * If the user specified a from address, it must be an approved sender.
 * Otherwise uses the support email address.
 * @param options - The user specified nodemailer options.
 * @returns The from address to use.
 */
export function getFromAddress(options: Mail.Options): string {
  const config = getConfig();

  if (options.from) {
    const fromAddress = addressToString(options.from);
    const fromEmail = extractEmailFromAddress(fromAddress);
    if (fromAddress && fromEmail && config.approvedSenderEmails?.split(',')?.includes(fromEmail)) {
      return fromAddress;
    }
    getLogger().warn('Email from address is not an approved sender', {
      from: fromAddress,
      approvedSenders: config.approvedSenderEmails,
    });
  }

  return config.supportEmail;
}

/**
 * Converts nodemailer addresses to an array of strings.
 * @param input - nodemailer address input.
 * @returns Array of string addresses.
 */
export function buildAddresses(input: string | Address | (string | Address)[] | undefined): string[] | undefined {
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
export function addressToString(address: Address | string | undefined): string | undefined {
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
 * Returns the email address from a string that may include a display name.
 * @param address - The email address string, which may include a display name.
 * @returns The email address extracted from the string, or undefined if the input is undefined.
 */
export function extractEmailFromAddress(address: string | undefined): string | undefined {
  if (!address) {
    return undefined;
  }
  // Handle "Display Name <email@example.com>" format
  const openBracket = address.indexOf('<');
  const closeBracket = address.indexOf('>', openBracket);
  if (openBracket !== -1 && closeBracket !== -1) {
    return address.substring(openBracket + 1, closeBracket).trim();
  }
  return address.trim();
}

/**
 * Builds a raw email message using nodemailer MailComposer.
 * @param options - The nodemailer options.
 * @returns The raw email message.
 */
export function buildRawMessage(options: Mail.Options): Promise<Uint8Array> {
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
