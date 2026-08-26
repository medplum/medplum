// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { MedplumClient } from '@medplum/core';
import { formatDate } from '@medplum/core';
import type { Patient } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import type { MockInstance } from 'vitest';
import {
  ElderJordanPatient,
  PatientFixtures,
  SchedulingFixtures,
  SubClinicProviderFixtures,
  SurgicalFixtures,
} from '../stories/scheduling';
import { clickAutocompleteOption, settleAutocomplete, typeInAutocomplete } from './asyncAutocomplete';
import { act, fireEvent, screen, within } from './render';

// Drives the booking form the way a user does, for the tests of both the proposal
// form and the wrapper that books for it. Assertion-free: what each test proves
// differs, reaching the point where it can be proved does not.

/** A Monday, so the stub has weekday hours ahead of it on the default search day. */
export const MONDAY_MORNING = new Date(2026, 7, 17, 8, 0, 0);

export async function setupBookingClient(): Promise<MockClient> {
  const medplum = new MockClient();
  for (const resource of [
    ...SchedulingFixtures,
    ...SurgicalFixtures,
    ...SubClinicProviderFixtures,
    ...PatientFixtures,
  ]) {
    await medplum.createResource(resource);
  }
  return medplum;
}

export function field(label: RegExp): HTMLElement {
  return screen.getByRole('searchbox', { name: label });
}

export async function chooseImagingService(): Promise<void> {
  await typeInAutocomplete(field(/visit type/i), 'Ultrasound');
  await clickAutocompleteOption('Ultrasound Imaging');
  await settleAutocomplete();
}

/**
 * Opens one role's field on everything it has, by focusing: `fireEvent.change` to the
 * value already in the box is not a change.
 *
 * @param role - The field to open.
 * @returns The field's search box.
 */
export async function openRoleField(role: RegExp): Promise<HTMLElement> {
  const input = field(role);
  await act(async () => {
    fireEvent.focus(input);
  });
  await settleAutocomplete();
  return input;
}

/**
 * Searches one field and returns the dropdown that field owns.
 *
 * Several autocompletes are on screen at once and a dropdown stays in the document
 * once opened, so an unscoped query could read — or click — another field's option.
 *
 * @param label - Matches the label above the field.
 * @param query - What to type, which is what the search narrows on.
 * @returns The field's dropdown.
 */
export async function searchField(label: RegExp, query: string): Promise<HTMLElement> {
  const input = field(label);
  await typeInAutocomplete(input, query);

  const listboxId = input.getAttribute('aria-controls');
  const listbox = listboxId && document.getElementById(listboxId);
  if (!listbox) {
    throw new Error(`No dropdown found for ${label.source}`);
  }
  return listbox;
}

export async function chooseActor(role: RegExp, query: string, name: string): Promise<void> {
  const listbox = await searchField(role, query);
  await act(async () => {
    fireEvent.click(within(listbox).getByText(name));
  });
  await settleAutocomplete();
}

/**
 * Takes one chosen value back out of the field holding it: the only way to change the
 * visit type, which takes its search box away while full.
 *
 * @param name - The value currently chosen.
 */
export async function removePill(name: string): Promise<void> {
  // Scoped to the pill, since a named resource is also on the slot card and in the
  // chosen time's description. Mantine's remove button is `aria-hidden`.
  const pill = screen.queryAllByText(name).find((node) => node.className.includes('Pill'));
  const remove = pill?.parentElement?.querySelector('button');
  if (!remove) {
    throw new Error(`No remove button on the ${name} pill`);
  }
  await act(async () => {
    fireEvent.click(remove);
  });
  await settleAutocomplete();
}

/**
 * Chooses a site in the location field, which holds one value at a time.
 * @param query - What to type.
 * @param name - The site to click out of what came back.
 */
export async function chooseSite(query: string, name: string): Promise<void> {
  const listbox = await searchField(/location/i, query);
  await act(async () => {
    fireEvent.click(within(listbox).getByText(name));
  });
  await settleAutocomplete();
}

/** Opens the time search, which is what sends the `$find` request. */
export async function openTimeFinder(): Promise<void> {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /find a time/i }));
  });
  await settleAutocomplete();
}

/**
 * Clicks a day in the time search's calendar.
 * @param dayOfMonth - The number the cell is labelled with.
 */
export async function chooseDay(dayOfMonth: string): Promise<void> {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: dayOfMonth }));
  });
  await settleAutocomplete();
}

/**
 * Picks the first time on offer, by position: times are read at the site, whose
 * timezone is not the runner's.
 *
 * @returns The label of the time that was picked.
 */
export async function chooseFirstOfferedTime(): Promise<string> {
  const [firstGroup] = await screen.findAllByTestId(/^slot-group-/);
  const [firstTime] = within(firstGroup).getAllByRole('button');
  const label = firstTime.textContent ?? '';
  await act(async () => {
    fireEvent.click(firstTime);
  });
  return label;
}

/** Picks the next time along, for a change of mind about the first. */
export async function chooseSecondOfferedTime(): Promise<void> {
  const [firstGroup] = await screen.findAllByTestId(/^slot-group-/);
  const [, secondTime] = within(firstGroup).getAllByRole('button');
  await act(async () => {
    fireEvent.click(secondTime);
  });
}

/**
 * Whether a field is holding a value, read off the pill rather than the state: the
 * fields ignore `defaultValue` after mount, so a cleared form could still show one.
 *
 * @param name - The value's label.
 * @returns Whether a pill is showing it.
 */
export function hasPill(name: string): boolean {
  return screen.queryAllByText(name).some((node) => node.className.includes('Pill'));
}

/**
 * The field holding the chosen time, or null while no time has been chosen — there is
 * no field at all before one is picked, so its absence is an assertion of its own.
 *
 * @returns The field, or null.
 */
export function chosenTimeField(): HTMLInputElement | null {
  return screen.queryByRole<HTMLInputElement>('textbox', { name: /date & time/i });
}

/**
 * Whether one element comes before another in the document.
 *
 * Where a field sits is part of the behaviour: the form asks the criteria, finds the
 * time, then takes the details, and the chosen time belongs above the control that
 * produced it. Only document order carries either.
 *
 * @param first - The element expected to come first.
 * @param second - The element expected to follow it.
 * @returns Whether they are in that order.
 */
export function isBefore(first: Element, second: Element): boolean {
  return Boolean(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING);
}

/**
 * The `start` the most recent `$find` asked for.
 * @param get - A spy on the client's `get`.
 * @returns The `start` parameter, or undefined when nothing was asked.
 */
export function lastFindStart(get: MockInstance<MedplumClient['get']>): string | undefined {
  const urls = get.mock.calls
    .map(([url]) => String(url))
    .filter((url) => url.includes('Appointment/$find') || url.includes('Appointment/%24find'));
  const last = urls.at(-1);
  return last ? (new URL(last, 'https://example.com').searchParams.get('start') ?? undefined) : undefined;
}

/**
 * The action that finds a time, under whichever of its three labels.
 * @returns The button.
 */
export function finderButton(): HTMLElement {
  return screen.getByRole('button', { name: /find a time|change time|close time finder/i });
}

/**
 * The action that writes the booking.
 * @returns The button.
 */
export function bookButton(): HTMLElement {
  return screen.getByRole('button', { name: /book appointment/i });
}

/**
 * What one patient's option row reads under their name.
 * @param patient - The patient on offer.
 * @param mrn - Their medical record number, for a patient with one on file.
 * @returns The line that tells them apart from a namesake.
 */
export function patientDetail(patient: Patient, mrn?: string): string {
  return [formatDate(patient.birthDate), mrn && `MRN ${mrn}`].filter(Boolean).join(' · ');
}

/**
 * Names the patient the visit is for.
 *
 * Chosen by the line under the name rather than the name itself, because two of
 * the fixtures share one — which is the reason that line is there.
 *
 * @param query - What to type, which is what the search narrows on.
 * @param detail - The birth date and medical record number of the one to pick.
 */
export async function choosePatient(query: string, detail: string): Promise<void> {
  const input = field(/patient/i);
  await typeInAutocomplete(input, query);

  const listboxId = input.getAttribute('aria-controls');
  const listbox = listboxId && document.getElementById(listboxId);
  if (!listbox) {
    throw new Error('No dropdown found for the patient field');
  }
  await act(async () => {
    fireEvent.click(within(listbox).getByText(detail));
  });
  await settleAutocomplete();
}

/** Answers everything a booking needs: a visit type, a provider, a time, a patient. */
export async function fillBooking(): Promise<void> {
  await chooseImagingService();
  await chooseActor(/provider/i, 'riv', 'Dr. Maya Rivera');
  await openTimeFinder();
  await chooseFirstOfferedTime();
  await choosePatient('Jordan', patientDetail(ElderJordanPatient, 'MRN-0041'));
}

/** Confirms the booking. */
export async function clickBook(): Promise<void> {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /book appointment/i }));
  });
  await settleAutocomplete();
}
