// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { formatHumanName } from '@medplum/core';
import type { Patient } from '@medplum/fhirtypes';

/** Identifier systems the roster knows how to label as an MRN. */
const MRN_SYSTEMS: { system: string; label: string }[] = [
  { system: 'https://drchrono.com/patients', label: 'DRCHRONO' },
  { system: 'https://zusapi.com/fhir/identifier/universal-id', label: 'ZUS' },
];

/**
 * The record number a clinician recognises. Prefers DrChrono, since that is the
 * system of record patients are imported from, and falls back to any identifier
 * the resource happens to carry.
 * @param patient - The patient to read an identifier from.
 * @returns A labelled MRN, or undefined when the patient carries no identifier.
 */
export function getMrn(patient: Patient): string | undefined {
  for (const { system, label } of MRN_SYSTEMS) {
    const match = patient.identifier?.find((i) => i.system === system)?.value;
    if (match) {
      return `${label}-${match}`;
    }
  }
  return patient.identifier?.find((i) => i.value)?.value;
}

export function getDisplayName(patient: Patient): string {
  const name = patient.name?.[0];
  return (name && formatHumanName(name)) || 'Unnamed patient';
}

export function getInitials(patient: Patient): string {
  const name = patient.name?.[0];
  const given = name?.given?.[0]?.[0] ?? '';
  const family = name?.family?.[0] ?? '';
  return (given + family).toUpperCase() || '?';
}

/**
 * US-style date, matching how the Lyfe roster renders a date of birth.
 * @param birthDate - An ISO date string, if the patient has one.
 * @returns The date as MM/DD/YYYY, or an em dash.
 */
export function formatDob(birthDate: string | undefined): string {
  if (!birthDate) {
    return '—';
  }
  const [y, m, d] = birthDate.split('-');
  return y && m && d ? `${m}/${d}/${y}` : birthDate;
}

/**
 * Whole years elapsed, accounting for whether this year's birthday has passed.
 * @param birthDate - An ISO date string, if the patient has one.
 * @returns Whole years as a string, or an em dash.
 */
export function getAge(birthDate: string | undefined): string {
  if (!birthDate) {
    return '—';
  }
  const dob = new Date(birthDate);
  if (Number.isNaN(dob.getTime())) {
    return '—';
  }
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const monthDelta = now.getMonth() - dob.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && now.getDate() < dob.getDate())) {
    age--;
  }
  return age >= 0 ? String(age) : '—';
}

// Avatar tints, picked deterministically from the name so a given patient keeps
// the same colour across renders and sessions.
const AVATAR_COLORS = ['blue', 'grape', 'violet', 'teal', 'cyan', 'indigo', 'pink'];

export function getAvatarColor(patient: Patient): string {
  const seed = getDisplayName(patient);
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

export function getContact(patient: Patient): { email?: string; phone?: string } {
  return {
    email: patient.telecom?.find((t) => t.system === 'email')?.value,
    phone: patient.telecom?.find((t) => t.system === 'phone' || t.system === 'sms')?.value,
  };
}

/**
 * Translate an age range into FHIR `birthdate` bounds.
 *
 * FHIR has no age search parameter — age is derived from `birthDate` — so the
 * filter has to be expressed as a date window. Someone who is at least `minAge`
 * was born on or before today minus `minAge` years; someone who is at most
 * `maxAge` was born after today minus `maxAge + 1` years, because they have not
 * yet had the birthday that would age them out.
 * @param minAge - Youngest age to include, in whole years.
 * @param maxAge - Oldest age to include, in whole years.
 * @returns `ge` and `le` ISO dates for the `birthdate` parameter, either possibly absent.
 */
export function ageToBirthDateBounds(
  minAge: number | undefined,
  maxAge: number | undefined
): { ge?: string; le?: string } {
  const iso = (d: Date): string => d.toISOString().slice(0, 10);
  const today = new Date();
  const bounds: { ge?: string; le?: string } = {};

  if (minAge !== undefined && Number.isFinite(minAge)) {
    const d = new Date(today);
    d.setFullYear(d.getFullYear() - minAge);
    bounds.le = iso(d);
  }

  if (maxAge !== undefined && Number.isFinite(maxAge)) {
    const d = new Date(today);
    d.setFullYear(d.getFullYear() - maxAge - 1);
    d.setDate(d.getDate() + 1);
    bounds.ge = iso(d);
  }

  return bounds;
}
