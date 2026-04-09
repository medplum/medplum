// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { Notifications, notifications } from '@mantine/notifications';
import type { WithId } from '@medplum/core';
import type { HealthcareService, Schedule } from '@medplum/fhirtypes';
import { DrAliceSmith, DrAliceSmithSchedule, MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { isCodeableReferenceLikeTo, toCodeableReferenceLike } from '../../utils/servicetype';
import { ScheduleSettings, ScheduleSettingsPage } from './ScheduleSettingsPage';

const SchedulingParametersURI = 'https://medplum.com/fhir/StructureDefinition/SchedulingParameters';
const ServiceTypeReferenceURI = 'https://medplum.com/fhir/service-type-reference';

describe('ScheduleSettings', () => {
  let medplum: MockClient;
  let schedulableService: WithId<HealthcareService>;
  let unschedulableService: WithId<HealthcareService>;

  const defaultSchedule: Schedule = {
    resourceType: 'Schedule',
    id: 'schedule-1',
    actor: [{ reference: 'Practitioner/practitioner-1' }],
    active: true,
  };

  beforeEach(async () => {
    // Prevent notifications from leaking across test cases
    notifications.clean();
  });

  beforeEach(async () => {
    medplum = new MockClient();
    vi.clearAllMocks();

    schedulableService = await medplum.createResource<HealthcareService>({
      resourceType: 'HealthcareService',
      name: 'Annual Checkup',
      type: [{ coding: [{ code: 'checkup' }], text: 'Annual Checkup' }],
      extension: [{ url: SchedulingParametersURI }],
    });

    unschedulableService = await medplum.createResource<HealthcareService>({
      resourceType: 'HealthcareService',
      name: 'Unschedulable Service',
      type: [{ coding: [{ code: 'unschedulable' }], text: 'Unschedulable' }],
      // no SchedulingParameters extension
    });
  });

  function renderSettings(schedule: Schedule): ReturnType<typeof render> {
    return render(
      <MemoryRouter>
        <MedplumProvider medplum={medplum}>
          <MantineProvider>
            <Notifications />
            <ScheduleSettings schedule={schedule} />
          </MantineProvider>
        </MedplumProvider>
      </MemoryRouter>
    );
  }

  describe('Empty / no-services state', () => {
    test('shows "No HealthcareServices found" alert when services list is empty', async () => {
      medplum.searchResources = vi.fn().mockResolvedValue([]);
      await act(async () => renderSettings(defaultSchedule));
      expect(screen.getByText('No HealthcareServices found.')).toBeInTheDocument();
    });
  });

  describe('Service list rendering', () => {
    test('shows schedulable services as labeled switches', async () => {
      await act(async () => renderSettings(defaultSchedule));
      expect(screen.getByRole('switch', { name: 'Annual Checkup' })).toBeInTheDocument();
    });

    test('lists unschedulable services in a separate section', async () => {
      await act(async () => renderSettings(defaultSchedule));
      expect(screen.getByText('Unschedulable Healthcare Services')).toBeInTheDocument();
      if (!unschedulableService.name) {
        throw new Error('Precondition failed; unschedulableService.name');
      }
      expect(screen.getByText(unschedulableService.name)).toBeInTheDocument();
    });

    test('omits unschedulable section when all services are schedulable', async () => {
      medplum.searchResources = vi.fn().mockResolvedValue([schedulableService]);
      await act(async () => renderSettings(defaultSchedule));
      expect(screen.queryByText('Unschedulable Healthcare Services')).not.toBeInTheDocument();
    });

    test('switch is checked when the service is already linked to the schedule', async () => {
      const schedule: Schedule = {
        ...defaultSchedule,
        serviceType: toCodeableReferenceLike(schedulableService),
      };
      await act(async () => renderSettings(schedule));
      expect(screen.getByRole('switch', { name: 'Annual Checkup' })).toBeChecked();
    });

    test('switch is unchecked when the service is not linked to the schedule', async () => {
      await act(async () => renderSettings(defaultSchedule));
      expect(screen.getByRole('switch', { name: 'Annual Checkup' })).not.toBeChecked();
    });
  });

  describe('Cancel / Back button label', () => {
    test('shows "Back" when no changes have been made', async () => {
      await act(async () => renderSettings(defaultSchedule));
      expect(screen.getByText('Back')).toBeInTheDocument();
      expect(screen.queryByText('Cancel')).not.toBeInTheDocument();
    });

    test('shows "Cancel" after a switch is toggled', async () => {
      const user = userEvent.setup();
      await act(async () => renderSettings(defaultSchedule));

      await user.click(screen.getByRole('switch', { name: 'Annual Checkup' }));

      expect(screen.getByText('Cancel')).toBeInTheDocument();
      expect(screen.queryByText('Back')).not.toBeInTheDocument();
    });
  });

  describe('Save Changes button state', () => {
    test('Save Changes button is disabled initially', async () => {
      await act(async () => renderSettings(defaultSchedule));
      expect(screen.getByRole('button', { name: 'Save Changes' })).toBeDisabled();
    });

    test('Save Changes button is enabled after toggling a switch', async () => {
      const user = userEvent.setup();
      await act(async () => renderSettings(defaultSchedule));

      await user.click(screen.getByRole('switch', { name: 'Annual Checkup' }));

      expect(screen.getByRole('button', { name: 'Save Changes' })).not.toBeDisabled();
    });
  });

  describe('Toggle behavior', () => {
    test('saving after toggling a switch on calls updateResource with the new serviceType entry', async () => {
      const user = userEvent.setup();
      const updateSpy = vi.spyOn(medplum, 'updateResource');
      await act(async () => renderSettings(defaultSchedule));

      await user.click(screen.getByRole('switch', { name: 'Annual Checkup' }));
      await user.click(screen.getByRole('button', { name: 'Save Changes' }));

      await waitFor(() => {
        expect(updateSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            resourceType: 'Schedule',
            id: defaultSchedule.id,
            serviceType: [
              {
                coding: [{ code: 'checkup' }],
                text: 'Annual Checkup',
                extension: [
                  {
                    url: ServiceTypeReferenceURI,
                    valueReference: {
                      reference: `HealthcareService/${schedulableService.id}`,
                      display: schedulableService.name,
                    },
                  },
                ],
              },
            ],
          })
        );
      });
    });

    test('toggling a switch on then back off leaves no reference artifacts in serviceType', async () => {
      // Set an unlinked entry into schedule.serviceType that should remain unchanged
      const schedule = await medplum.updateResource({
        ...defaultSchedule,
        serviceType: [{ coding: [{ code: 'demo' }] }],
      });

      const user = userEvent.setup();
      const updateSpy = vi.spyOn(medplum, 'updateResource');
      // Start with the service not linked
      await act(async () => renderSettings(schedule));

      // Toggle on then back off
      await user.click(screen.getByRole('switch', { name: 'Annual Checkup' }));
      await user.click(screen.getByRole('switch', { name: 'Annual Checkup' }));
      await user.click(screen.getByRole('button', { name: 'Save Changes' }));

      await waitFor(() => {
        const [savedSchedule] = updateSpy.mock.calls[0] as [Schedule];
        expect(savedSchedule.serviceType).toEqual([{ coding: [{ code: 'demo' }] }]);
      });
    });

    test('toggling a switch off removes that service from serviceType', async () => {
      const user = userEvent.setup();
      const schedule: Schedule = {
        ...defaultSchedule,
        serviceType: toCodeableReferenceLike(schedulableService),
      };
      const updateSpy = vi.spyOn(medplum, 'updateResource');
      await act(async () => renderSettings(schedule));

      // Switch starts checked; toggle it off
      await user.click(screen.getByRole('switch', { name: 'Annual Checkup' }));
      await user.click(screen.getByRole('button', { name: 'Save Changes' }));

      await waitFor(() => {
        const [savedSchedule] = updateSpy.mock.calls[0] as [Schedule];
        expect(isCodeableReferenceLikeTo(savedSchedule.serviceType, schedulableService)).toBeFalsy();
      });
    });
  });

  describe('Save flow', () => {
    test('successful save shows success notification and resets dirty state', async () => {
      const user = userEvent.setup();
      await act(async () => renderSettings(defaultSchedule));

      await user.click(screen.getByRole('switch', { name: 'Annual Checkup' }));
      await user.click(screen.getByRole('button', { name: 'Save Changes' }));

      await waitFor(() => {
        expect(screen.getByText('Schedule updated')).toBeInTheDocument();
      });

      // Dirty state cleared: Save is disabled again and label returns to "Back"
      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Save Changes' })).toBeDisabled();
        expect(screen.getByText('Back')).toBeInTheDocument();
      });
    });

    test('failed save shows an error notification and preserves dirty state', async () => {
      const user = userEvent.setup();
      vi.spyOn(medplum, 'updateResource').mockRejectedValue(new Error('Save failed'));
      await act(async () => renderSettings(defaultSchedule));

      await user.click(screen.getByRole('switch', { name: 'Annual Checkup' }));
      await user.click(screen.getByRole('button', { name: 'Save Changes' }));

      await waitFor(() => {
        expect(screen.getByText(/Save failed/i)).toBeInTheDocument();
      });

      // Dirty state not cleared; Save button remains enabled
      expect(screen.getByRole('button', { name: 'Save Changes' })).not.toBeDisabled();
    });
  });
});

describe('ScheduleSettingsPage', () => {
  let medplum: MockClient;

  beforeEach(() => {
    medplum = new MockClient({ profile: DrAliceSmith });
    vi.clearAllMocks();
  });

  function setup(path = `/Calendar/Schedule/${DrAliceSmithSchedule.id}/settings`): ReturnType<typeof render> {
    return render(
      <MemoryRouter initialEntries={[path]}>
        <MedplumProvider medplum={medplum}>
          <MantineProvider>
            <Notifications />
            <Routes>
              <Route path="/Calendar/Schedule/:id/settings" element={<ScheduleSettingsPage />} />
            </Routes>
          </MantineProvider>
        </MedplumProvider>
      </MemoryRouter>
    );
  }

  test('renders the "Schedule Settings" heading', async () => {
    await act(async () => setup());
    expect(screen.getByRole('heading', { name: 'Schedule Settings' })).toBeInTheDocument();
  });

  test('renders the ScheduleSettings form once the schedule has loaded', async () => {
    await act(async () => setup());

    // With no HealthcareServices, the form shows the empty-state alert
    await waitFor(() => {
      expect(screen.getByText('No HealthcareServices found.')).toBeInTheDocument();
    });
  });

  test('shows a loader while the schedule is resolving', () => {
    // Prevent readReference from resolving so the schedule stays undefined
    medplum.readReference = vi.fn().mockReturnValue(new Promise(() => {}));
    render(
      <MemoryRouter initialEntries={[`/Calendar/Schedule/unknown-id/settings`]}>
        <MedplumProvider medplum={medplum}>
          <MantineProvider>
            <Notifications />
            <Routes>
              <Route path="/Calendar/Schedule/:id/settings" element={<ScheduleSettingsPage />} />
            </Routes>
          </MantineProvider>
        </MedplumProvider>
      </MemoryRouter>
    );

    // Schedule not yet resolved — form buttons should not be present
    expect(screen.queryByRole('button', { name: 'Save Changes' })).not.toBeInTheDocument();
  });
});
