// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { MedplumClient } from '@medplum/core';
import type { Appointment, Slot } from '@medplum/fhirtypes';
import type { MockClient } from '@medplum/mock';
import type { JSX } from 'react';
import type { MockInstance } from 'vitest';
import { installBookStub } from '../stories/mockBook';
import { installFindStub } from '../stories/mockFind';
import { installAutocompleteTimers } from '../test-utils/asyncAutocomplete';
import {
  bookButton,
  chosenTimeField,
  clickBook,
  field,
  fillBooking,
  MONDAY_MORNING,
  setupBookingClient,
} from '../test-utils/bookingForm';
import { renderWithMedplum, screen } from '../test-utils/render';
import type { AppointmentBookingFormProps } from './AppointmentBookingForm';
import { AppointmentBookingForm } from './AppointmentBookingForm';

installAutocompleteTimers();

/** Every mount needs one, and it is the only prop a host must supply. */
const onBooked = vi.fn();

function setup(medplum: MockClient, props?: Partial<AppointmentBookingFormProps>): void {
  const element: JSX.Element = <AppointmentBookingForm onBooked={onBooked} {...props} />;
  renderWithMedplum(element, medplum);
}

/**
 * What the booking reported writing.
 * @returns The booking `onBooked` was handed.
 */
function reportedBooking(): { appointment: Appointment; slots: Slot[] } {
  const [booking] = onBooked.mock.calls[0] as [{ appointment: Appointment; slots: Slot[] }];
  return booking;
}

/**
 * How many times `$book` was posted.
 *
 * Counted off the URL rather than off the spy: the stub standing in for the
 * server writes the appointment and its slots through the same `post`.
 *
 * @param post - The spy standing in front of the client's `post`.
 * @returns The number of bookings written.
 */
function bookCount(post: MockInstance<MedplumClient['post']>): number {
  return post.mock.calls.filter(([url]) => String(url).includes('$book')).length;
}

describe('AppointmentBookingForm', () => {
  let medplum: MockClient;
  let restoreFind: () => void;
  let restoreBook: () => void;

  beforeEach(async () => {
    vi.setSystemTime(MONDAY_MORNING);
    onBooked.mockClear();
    onBooked.mockResolvedValue(undefined);
    medplum = await setupBookingClient();
    restoreFind = installFindStub(medplum);
    restoreBook = installBookStub(medplum);
  });

  afterEach(() => {
    restoreBook();
    restoreFind();
  });

  describe('Mounting the booking form', () => {
    test('Books with nothing supplied but the booking callback', async () => {
      // The zero-configuration case: one prop, every field offered, and a booking
      // written without the host issuing a request of its own.
      setup(medplum);
      expect(field(/patient/i)).toBeInTheDocument();

      await fillBooking();
      await clickBook();

      expect(onBooked).toHaveBeenCalledTimes(1);
      const booking = reportedBooking();
      expect(booking.appointment.id).toBeDefined();
      expect(booking.appointment.status).toBe('booked');
      expect(booking.slots.length).toBeGreaterThan(0);
    });
  });

  describe('Booking the appointment', () => {
    test('Persists the booking and reports what was written', async () => {
      const post = vi.spyOn(medplum, 'post');
      setup(medplum);
      await fillBooking();
      await clickBook();

      expect(String(post.mock.calls[0][0])).toContain('Appointment/$book');
      const booking = reportedBooking();
      expect(booking.appointment.resourceType).toBe('Appointment');
      expect(booking.slots.every((slot) => slot.resourceType === 'Slot')).toBe(true);
    });

    test('Announces the appointment and every slot it reserved', async () => {
      const notify = vi.spyOn(medplum, 'notifyResourceModified');
      setup(medplum);
      await fillBooking();
      await clickBook();

      // `$book` is a custom operation, so nothing else invalidates the caches a
      // host's own calendar reads from.
      const announced = notify.mock.calls.map(([event]) => event.resourceType);
      expect(announced).toContain('Appointment');
      expect(announced).toContain('Slot');
    });

    test('Reports a booking the host callback threw over as written', async () => {
      onBooked.mockRejectedValueOnce(new Error('Calendar refresh failed'));
      const post = vi.spyOn(medplum, 'post');
      setup(medplum);
      await fillBooking();
      await clickBook();

      // The appointment exists by the time `onBooked` runs, so what the host does
      // with it afterwards is not the booking failing. Painting the refusal here
      // would show an error over a time that was taken, and invite a second click.
      expect(bookCount(post)).toBe(1);
      expect(screen.queryByText('Calendar refresh failed')).not.toBeInTheDocument();
      expect(bookButton()).toBeDisabled();
    });

    test('Writes a booking once, however many times the button is clicked', async () => {
      const post = vi.spyOn(medplum, 'post');
      setup(medplum);
      await fillBooking();
      await clickBook();

      // Every answer stays on screen, because a refusal needs them; the button is
      // what keeps that from booking the same time a second time.
      expect(bookButton()).toBeDisabled();
      await clickBook();
      expect(bookCount(post)).toBe(1);
    });

    test('Shows a refused booking and keeps every answer', async () => {
      vi.spyOn(medplum, 'post').mockRejectedValue(new Error('Slot is no longer available'));
      setup(medplum);
      await fillBooking();
      const time = (chosenTimeField() as HTMLInputElement).value;
      await clickBook();

      expect(await screen.findByText('Slot is no longer available')).toBeInTheDocument();
      // A refusal is usually somebody else taking the time, and the next attempt
      // is one field away.
      expect(chosenTimeField()?.value).toBe(time);
      expect(screen.getByText('Jordan Reyes')).toBeInTheDocument();
      expect(onBooked).not.toHaveBeenCalled();
    });
  });
});
