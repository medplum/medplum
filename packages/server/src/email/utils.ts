import MailComposer from 'nodemailer/lib/mail-composer';
import Mail, { Address } from 'nodemailer/lib/mailer';
import { getConfig } from '../config';

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
    if (fromAddress && config.approvedSenderEmails?.split(',')?.includes(fromAddress)) {
      return fromAddress;
    }
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
