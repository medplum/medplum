// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { OperationOutcomeError, badRequest } from '@medplum/core';
import type { Project } from '@medplum/fhirtypes';
import MailComposer from 'nodemailer/lib/mail-composer/index.js';
import type Mail from 'nodemailer/lib/mailer';
import type { Address } from 'nodemailer/lib/mailer';
import { getConfig } from '../config/loader';
import type { MedplumSmtpConfig } from '../config/types';
import { getLogger } from '../logger';

export interface ProjectSmtpConfig extends MedplumSmtpConfig {
  fromAddress?: string;
  approvedSenderEmails?: string;
}

/**
 * Returns the project-level SMTP configuration, if configured.
 * Project SMTP is configured via Project.secret entries: smtpHost, smtpPort, smtpUsername, smtpPassword,
 * and optionally smtpSecure, smtpFromAddress, and smtpApprovedSenders.
 * @param project - The project to read SMTP configuration from.
 * @returns The project SMTP configuration, or undefined if not configured or disabled by server config.
 */
export function getProjectSmtpConfig(project: WithId<Project>): ProjectSmtpConfig | undefined {
  if (getConfig().allowProjectSmtp === false) {
    return undefined;
  }

  const secrets = project.secret;
  const host = secrets?.find((s) => s.name === 'smtpHost')?.valueString;
  if (!host) {
    // Project SMTP not configured - caller falls back to server transport
    return undefined;
  }

  const port = secrets?.find((s) => s.name === 'smtpPort')?.valueInteger;
  const username = secrets?.find((s) => s.name === 'smtpUsername')?.valueString;
  const password = secrets?.find((s) => s.name === 'smtpPassword')?.valueString;
  if (!port || port <= 0 || !username || !password) {
    getLogger().warn('Project SMTP is misconfigured', {
      projectId: project.id,
      missing: [!port || port <= 0 ? 'smtpPort' : '', !username ? 'smtpUsername' : '', !password ? 'smtpPassword' : '']
        .filter(Boolean)
        .join(','),
    });
    throw new OperationOutcomeError(badRequest('Project SMTP configuration is incomplete or invalid'));
  }

  return {
    host,
    port,
    username,
    password,
    secure: secrets?.find((s) => s.name === 'smtpSecure')?.valueBoolean ?? port === 465,
    fromAddress: secrets?.find((s) => s.name === 'smtpFromAddress')?.valueString,
    approvedSenderEmails: secrets?.find((s) => s.name === 'smtpApprovedSenders')?.valueString,
  };
}

/**
 * Returns the from address to use.
 * If the user specified a from address, it must be an approved sender.
 * When project SMTP is active, approval is validated only against the project's approved sender list,
 * and the project's default from address is used as the fallback.
 * Otherwise uses the server approved sender list and the support email address.
 * @param options - The user specified nodemailer options.
 * @param projectSmtp - Optional project SMTP configuration.
 * @returns The from address to use.
 */
export function getFromAddress(options: Mail.Options, projectSmtp?: ProjectSmtpConfig): string {
  const config = getConfig();
  const approvedSenderEmails = projectSmtp ? projectSmtp.approvedSenderEmails : config.approvedSenderEmails;
  const defaultFrom = projectSmtp?.fromAddress ?? config.supportEmail;

  if (options.from) {
    const fromAddress = addressToString(options.from);
    const fromEmail = extractEmailFromAddress(fromAddress);
    if (fromAddress && fromEmail && approvedSenderEmails?.split(',')?.includes(fromEmail)) {
      return fromAddress;
    }
    getLogger().warn('Email from address is not an approved sender', {
      from: fromAddress,
      approvedSenders: approvedSenderEmails,
      usingProjectSmtp: Boolean(projectSmtp),
    });
  }

  return defaultFrom;
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
export function addressToString(address: (string | Address)[] | Address | string | undefined): string | undefined {
  if (!address) {
    return undefined;
  }
  if (Array.isArray(address)) {
    address = address[0];
  }
  if (typeof address === 'string') {
    return address;
  }
  if (typeof address === 'object' && 'address' in address) {
    return address.address;
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
