// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { badRequest, OperationOutcomeError } from '@medplum/core';

/**
 * List of blocked file extensions.
 * Derived from "File types blocked in Gmail"
 * https://support.google.com/mail/answer/6590?hl=en#zippy=%2Cmessages-that-have-attachments
 */
const BLOCKED_FILE_EXTENSIONS = [
  '.ade',
  '.adp',
  '.apk',
  '.appx',
  '.appxbundle',
  '.bat',
  '.cab',
  '.chm',
  '.cmd',
  '.com',
  '.cpl',
  '.dll',
  '.dmg',
  '.ex',
  '.ex_',
  '.exe',
  '.hta',
  '.ins',
  '.isp',
  '.iso',
  '.jar',
  '.jse',
  '.lib',
  '.lnk',
  '.mde',
  '.msc',
  '.msi',
  '.msix',
  '.msixbundle',
  '.msp',
  '.mst',
  '.nsh',
  '.php',
  '.pif',
  '.ps1',
  '.scr',
  '.sct',
  '.shb',
  '.sys',
  '.vb',
  '.vbe',
  '.vbs',
  '.vxd',
  '.wsc',
  '.wsf',
  '.wsh',
];

/**
 * List of blocked content types.
 * Derived from: https://developer.mozilla.org/en-US/docs/Web/HTTP/Basics_of_HTTP/MIME_types/Common_types
 */
const BLOCKED_CONTENT_TYPES = [
  'application/java-archive',
  'application/x-msdownload',
  'application/x-sh',
  'application/vnd.apple.installer+xml',
  'application/vnd.microsoft.portable-executable',
];

/**
 * Checks file metadata against blocked lists.
 * Throws an execption if the file metadata is blocked.
 * @param filename - The input filename.
 * @param contentType - The input content type.
 */
export function checkFileMetadata(filename: string | undefined, contentType: string | undefined): void {
  if (checkFileExtension(filename)) {
    throw new OperationOutcomeError(badRequest('Invalid file extension'));
  }
  if (checkContentType(contentType)) {
    throw new OperationOutcomeError(badRequest('Invalid content type'));
  }
}

/**
 * Checks if the file extension is blocked.
 * @param filename - The input filename.
 * @returns True if the filename has a blocked file extension.
 */
function checkFileExtension(filename: string | undefined): boolean {
  if (filename) {
    const lower = filename.toLowerCase();
    for (const ext of BLOCKED_FILE_EXTENSIONS) {
      if (lower.endsWith(ext)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Checks if the content type is blocked.
 * @param contentType - The input content type.
 * @returns True if the content type is blocked.
 */
function checkContentType(contentType: string | undefined): boolean {
  if (contentType) {
    return BLOCKED_CONTENT_TYPES.includes(contentType.toLowerCase());
  }

  return false;
}
