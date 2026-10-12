// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { formatDate, formatDateTime } from '@medplum/core';

/*
 * Helpers for reading a C-CDA DOM. Elements are matched by `localName` so documents
 * work with or without a namespace prefix on the HL7 v3 elements.
 */

export function childEl(el: Element | undefined, ...path: string[]): Element | undefined {
  let current = el;
  for (const name of path) {
    current = childEls(current, name)[0];
  }
  return current;
}

export function childEls(el: Element | undefined, name: string): Element[] {
  if (!el) {
    return [];
  }
  return Array.from(el.children).filter((child) => child.localName === name);
}

export function attr(el: Element | undefined, name: string): string | undefined {
  return el?.getAttribute(name) ?? undefined;
}

export function textOf(el: Element | undefined): string {
  return el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
}

export type ParsedCcda = { readonly document: Element; readonly error?: undefined } | { readonly error: string };

export function parseCcda(xml: string): ParsedCcda {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const parserError = doc.getElementsByTagName('parsererror')[0];
  if (parserError) {
    return { error: textOf(parserError) || 'Invalid XML' };
  }
  if (doc.documentElement.localName !== 'ClinicalDocument') {
    return { error: 'Not a C-CDA document: missing ClinicalDocument root' };
  }
  return { document: doc.documentElement };
}

/**
 * Formats an HL7 v3 TS value (`YYYY[MM[DD[HH[MM[SS[.S]]]]]][+/-ZZZZ]`).
 * @param value - The TS value.
 * @returns The human readable date or date-time, or the raw value if it cannot be parsed.
 */
export function formatCdaTimestamp(value: string | undefined): string {
  const match = value?.match(/^(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?(?:\.\d+)?([+-]\d{4})?$/);
  if (!value || !match) {
    return value ?? '';
  }
  const [, year, month, day, hour, minute, second, tz] = match;
  if (!month) {
    return year;
  }
  if (!day) {
    return formatDate(`${year}-${month}-01`, undefined, { year: 'numeric', month: 'short' });
  }
  const date = `${year}-${month}-${day}`;
  if (!hour) {
    return formatDate(date);
  }
  const offset = tz ? `${tz.slice(0, 3)}:${tz.slice(3)}` : '';
  return formatDateTime(`${date}T${hour}:${minute ?? '00'}:${second ?? '00'}${offset}`);
}

/**
 * Formats an IVL_TS (low/high) or a plain TS element.
 * @param el - The effectiveTime element.
 * @returns The human readable time or period.
 */
export function formatCdaTime(el: Element | undefined): string {
  if (!el) {
    return '';
  }
  const value = attr(el, 'value');
  if (value) {
    return formatCdaTimestamp(value);
  }
  const low = formatCdaTimestamp(attr(childEl(el, 'low'), 'value'));
  const high = formatCdaTimestamp(attr(childEl(el, 'high'), 'value'));
  if (low && high) {
    return `${low} – ${high}`;
  }
  return low || high;
}

export function formatCdaName(nameEl: Element | undefined): string {
  if (!nameEl) {
    return '';
  }
  const parts = ['prefix', 'given', 'family', 'suffix'].flatMap((part) => childEls(nameEl, part).map(textOf));
  const formatted = parts.filter(Boolean).join(' ');
  return formatted || textOf(nameEl);
}

export function formatCdaAddress(addr: Element | undefined): string {
  if (!addr || attr(addr, 'nullFlavor')) {
    return '';
  }
  const street = childEls(addr, 'streetAddressLine').map(textOf);
  const cityState = [textOf(childEl(addr, 'city')), textOf(childEl(addr, 'state'))].filter(Boolean).join(', ');
  const line = [cityState, textOf(childEl(addr, 'postalCode'))].filter(Boolean).join(' ');
  return [...street, line, textOf(childEl(addr, 'country'))].filter(Boolean).join(', ');
}

const TELECOM_USE: Record<string, string> = {
  AS: 'Answering service',
  BAD: 'Bad',
  DIR: 'Direct',
  EC: 'Emergency contact',
  H: 'Home',
  HP: 'Home',
  HV: 'Vacation home',
  MC: 'Mobile',
  PG: 'Pager',
  PUB: 'Public',
  TMP: 'Temporary',
  WP: 'Work',
};

export function formatCdaTelecom(telecom: Element): string {
  const value = attr(telecom, 'value')?.replace(/^(tel|mailto|fax|http|https):/, '');
  if (!value) {
    return '';
  }
  const use = TELECOM_USE[attr(telecom, 'use') ?? ''];
  return use ? `${use}: ${value}` : value;
}

/**
 * Formats a CD/CE coded value as its display name, falling back to original text and code.
 * @param code - The coded element.
 * @returns The human readable code.
 */
export function formatCdaCode(code: Element | undefined): string {
  if (!code || attr(code, 'nullFlavor')) {
    return '';
  }
  return attr(code, 'displayName') || textOf(childEl(code, 'originalText')) || attr(code, 'code') || '';
}

const GENDER: Record<string, string> = { F: 'Female', M: 'Male', UN: 'Undifferentiated' };

export function formatCdaGender(code: Element | undefined): string {
  return GENDER[attr(code, 'code') ?? ''] ?? formatCdaCode(code);
}

export function formatCdaId(id: Element): string {
  const extension = attr(id, 'extension');
  const root = attr(id, 'root');
  return extension ? `${extension} (${root})` : (root ?? '');
}

export function isSafeHref(href: string | undefined): href is string {
  return !!href && /^https?:\/\//i.test(href.trim());
}

export function isSafeImageSrc(src: string | undefined): src is string {
  return !!src && (/^https?:\/\//i.test(src.trim()) || /^data:image\/(png|gif|jpeg|webp);/i.test(src.trim()));
}
