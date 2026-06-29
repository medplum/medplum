// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { decodeBase64Url, encodeBase64Url } from './base64';
import { isString } from './utils';

export type SmartHealthLinkMode = 'manifest' | 'direct';

export interface GenerateSmartHealthLinkParams {
  mode?: SmartHealthLinkMode;
  _type?: string;
  exp?: number;
  label?: string;
  passcode?: string;
  includeQrCode?: boolean;
}

export interface ResolveSmartHealthLinkParams {
  shlink?: string;
  recipient?: string;
  passcode?: string;
}

export interface SmartHealthLinkPayload {
  url: string;
  key: string;
  exp?: number;
  flag?: string;
  label?: string;
  v?: 1;
}

export interface SmartHealthLinkManifestFile {
  contentType: string;
  embedded: string;
  lastUpdated?: string;
}

export function encodeSmartHealthLink(payload: SmartHealthLinkPayload): string {
  return `shlink:/${encodeBase64Url(JSON.stringify(payload))}`;
}

export function parseSmartHealthLink(input: string): SmartHealthLinkPayload {
  const fragmentIndex = input.indexOf('#shlink:/');
  const raw = fragmentIndex === -1 ? input : input.substring(fragmentIndex + 1);
  if (!raw.startsWith('shlink:/')) {
    throw new Error('Invalid SMART Health Link URI');
  }
  const payload = JSON.parse(decodeBase64Url(raw.substring('shlink:/'.length)));
  if (!payload || (payload.v !== undefined && payload.v !== 1) || !isString(payload.url) || !isString(payload.key)) {
    throw new Error('Invalid SMART Health Link payload');
  }
  return payload as SmartHealthLinkPayload;
}

export function getSmartHealthLinkId(manifestUrl: string): string | undefined {
  const match = /\/shl\/([^/]+)\/(?:manifest|payload)$/.exec(manifestUrl);
  return match?.[1];
}
