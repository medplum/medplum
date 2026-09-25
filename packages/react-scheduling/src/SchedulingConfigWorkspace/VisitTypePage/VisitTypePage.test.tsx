// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { badRequest, OperationOutcomeError } from '@medplum/core';
import type { Bundle, HealthcareService, Location } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import {
  getHealthcareServiceSchedulingParameterValues,
  setHealthcareServiceSchedulingParameterValues,
} from '../../parameterValues';
import {
  clickAutocompleteOption,
  installAutocompleteTimers,
  removePill,
  settleAutocomplete,
  typeInAutocomplete,
} from '../../test-utils/asyncAutocomplete';
import { act, fireEvent, renderWithMedplum, screen, userEvent, waitFor, within } from '../../test-utils/render';
import { VisitTypePage } from './VisitTypePage';

const downtown: WithId<Location> = { resourceType: 'Location', id: 'downtown', name: 'Downtown Clinic' };
const northside: WithId<Location> = { resourceType: 'Location', id: 'northside', name: 'Northside' };

const initialVisit = setHealthcareServiceSchedulingParameterValues(
  {
    resourceType: 'HealthcareService',
    name: 'Initial Visit',
    availableTime: [{ daysOfWeek: ['mon', 'tue'], availableStartTime: '09:00:00', availableEndTime: '17:00:00' }],
  },
  { duration: 60, bufferAfter: 10 }
);

interface Setup {
  readonly medplum: MockClient;
  readonly stored?: WithId<HealthcareService>;
  readonly onStored: ReturnType<typeof vi.fn>;
  readonly onDiscardNew: ReturnType<typeof vi.fn>;
}

// Opens `service` as stored, or a new visit type when it is null.
async function setup(service: HealthcareService | null = initialVisit): Promise<Setup> {
  const medplum = new MockClient({ seedDefaultData: false });
  await medplum.createResource(downtown);
  await medplum.createResource(northside);
  const stored = service ? await medplum.createResource(service) : undefined;
  const onStored = vi.fn();
  const onDiscardNew = vi.fn();
  vi.spyOn(medplum, 'executeBatch');
  renderWithMedplum(<VisitTypePage service={stored} onStored={onStored} onDiscardNew={onDiscardNew} />, medplum);
  return { medplum, stored, onStored, onDiscardNew };
}

function saveBar(): HTMLElement | null {
  return screen.queryByRole('region', { name: 'Unsaved changes' });
}

function saveButton(): HTMLElement {
  return within(saveBar() as HTMLElement).getByRole('button', { name: /^(Save|Create)$/ });
}

function parameter(name: string): HTMLElement {
  return screen.getByTestId(`scheduling-parameters-${name}`);
}

function lastStored(onStored: Setup['onStored']): WithId<HealthcareService> {
  return onStored.mock.calls.at(-1)?.[0];
}

function sentBundle(medplum: MockClient): Bundle {
  return vi.mocked(medplum.executeBatch).mock.calls[0][0];
}

describe('VisitTypePage', () => {
  test('shows the stored configuration in editable fields, section by section', async () => {
    await setup();

    const headings = screen.getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent);
    expect(headings).toEqual(['General', 'Scheduling parameters', 'Default availability']);
    expect(screen.getByLabelText(/Name/)).toHaveValue('Initial Visit');
    expect(screen.getByRole('switch', { name: 'Active' })).toBeChecked();
    expect(parameter('duration')).toHaveValue('60 min');
    expect(screen.getByPlaceholderText('Offered at every service facility')).toBeInTheDocument();
    expect(saveBar()).toBeNull();
  });

  test('an edit that changes nothing stored, like a trailing space, offers no save', async () => {
    await setup();

    await userEvent.type(screen.getByLabelText(/Name/), ' ');

    expect(saveBar()).toBeNull();
  });

  test('an edit shows the save bar, and changing it back hides it again', async () => {
    await setup();

    await userEvent.type(screen.getByLabelText(/Name/), ' (new)');
    expect(saveBar()).toBeInTheDocument();

    await userEvent.clear(screen.getByLabelText(/Name/));
    await userEvent.type(screen.getByLabelText(/Name/), 'Initial Visit');
    expect(saveBar()).toBeNull();
  });

  test('Discard returns every field to what is stored', async () => {
    await setup();
    await userEvent.type(screen.getByLabelText(/Name/), ' (new)');
    await userEvent.click(screen.getByRole('switch', { name: 'Active' }));

    await userEvent.click(within(saveBar() as HTMLElement).getByRole('button', { name: 'Discard' }));

    expect(screen.getByLabelText(/Name/)).toHaveValue('Initial Visit');
    expect(screen.getByRole('switch', { name: 'Active' })).toBeChecked();
    expect(saveBar()).toBeNull();
  });

  test('saving sends only this visit type, conditional on the version loaded, and hands back what was stored', async () => {
    const { medplum, stored, onStored } = await setup();

    await userEvent.clear(parameter('duration'));
    await userEvent.type(parameter('duration'), '45');
    await userEvent.type(parameter('slotCapacity'), '2');
    await userEvent.click(saveButton());

    await waitFor(() => expect(onStored).toHaveBeenCalled());
    const bundle = sentBundle(medplum);
    expect(bundle.entry).toHaveLength(1);
    expect(bundle.entry?.[0].request?.ifMatch).toBe(`W/"${stored?.meta?.versionId}"`);
    expect(getHealthcareServiceSchedulingParameterValues(lastStored(onStored))).toMatchObject({
      duration: 45,
      bufferAfter: 10,
      slotCapacity: 2,
    });
  });

  test('turning Active off stores active false', async () => {
    const { onStored } = await setup();

    await userEvent.click(screen.getByRole('switch', { name: 'Active' }));
    await userEvent.click(saveButton());

    await waitFor(() => expect(onStored).toHaveBeenCalled());
    expect(lastStored(onStored).active).toBe(false);
  });

  test('editing only the name leaves the stored hours untouched', async () => {
    const { stored, onStored } = await setup();

    await userEvent.type(screen.getByLabelText(/Name/), ' (adult)');
    await userEvent.click(saveButton());

    await waitFor(() => expect(onStored).toHaveBeenCalled());
    expect(lastStored(onStored).availableTime).toEqual(stored?.availableTime);
  });

  test('changing the default hours stores them as the visit type availableTime', async () => {
    const { onStored } = await setup();

    await act(async () => {
      fireEvent.focus(screen.getByTestId('schedule-availability-end-mon-0'));
    });
    await act(async () => {
      fireEvent.click(screen.getByText('12:00 PM'));
    });
    await userEvent.click(saveButton());

    await waitFor(() => expect(onStored).toHaveBeenCalled());
    expect(lastStored(onStored).availableTime).toEqual([
      { daysOfWeek: ['mon'], availableStartTime: '09:00:00', availableEndTime: '12:00:00' },
      { daysOfWeek: ['tue'], availableStartTime: '09:00:00', availableEndTime: '17:00:00' },
    ]);
  });

  test('says each calendar reads the hours in its own time zone when the visit type sets none', async () => {
    await setup();

    expect(
      screen.getByText('This visit type sets no time zone, so each calendar reads these hours in its own time zone.')
    ).toBeInTheDocument();
  });

  test('an invalid value is highlighted and Save says why it is refused', async () => {
    const { medplum } = await setup();

    await userEvent.type(parameter('alignmentInterval'), '1441');
    await userEvent.click(saveButton());

    expect(saveButton()).toHaveAttribute('aria-disabled', 'true');
    expect(saveButton()).toHaveAccessibleDescription('Fix the highlighted fields before saving.');
    expect(screen.getByText('Interval cannot be more than 1440 minutes (1 day).')).toBeInTheDocument();
    expect(medplum.executeBatch).not.toHaveBeenCalled();
  });

  test('a value already stored out of range does not block saving another field', async () => {
    const { onStored } = await setup(
      setHealthcareServiceSchedulingParameterValues(
        { resourceType: 'HealthcareService', name: 'Legacy', availableTime: initialVisit.availableTime },
        { duration: 30, alignmentInterval: 2000 }
      )
    );

    await userEvent.type(screen.getByLabelText(/Name/), ' visit');
    await userEvent.click(saveButton());

    await waitFor(() => expect(onStored).toHaveBeenCalled());
  });

  test('a reload that fails after a conflict says why', async () => {
    const { medplum, stored } = await setup();
    await medplum.updateResource({ ...(stored as WithId<HealthcareService>), name: 'Initial Visit (renamed)' });
    await userEvent.type(screen.getByLabelText(/Name/), ' (mine)');
    await userEvent.click(saveButton());
    await screen.findByText('Initial Visit changed since you opened it');
    vi.spyOn(medplum, 'readResource').mockRejectedValueOnce(new Error('Network down'));

    await userEvent.click(screen.getByRole('button', { name: 'Reload' }));

    expect(await screen.findByText('Could not reload it: Network down')).toBeInTheDocument();
  });

  test('a visit type changed elsewhere since it was opened is not written over, and can be reloaded', async () => {
    const { medplum, stored, onStored } = await setup();
    await medplum.updateResource({ ...(stored as WithId<HealthcareService>), name: 'Initial Visit (renamed)' });

    await userEvent.type(screen.getByLabelText(/Name/), ' (mine)');
    await userEvent.click(saveButton());

    expect(await screen.findByText('Initial Visit changed since you opened it')).toBeInTheDocument();
    expect(onStored).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/Name/)).toHaveValue('Initial Visit (mine)');

    await userEvent.click(screen.getByRole('button', { name: 'Reload' }));
    await waitFor(() => expect(onStored).toHaveBeenCalled());
    expect(lastStored(onStored).name).toBe('Initial Visit (renamed)');
  });

  test('a save the server refuses keeps the edits and shows why', async () => {
    const { medplum, onStored } = await setup();
    vi.mocked(medplum.executeBatch).mockRejectedValueOnce(new OperationOutcomeError(badRequest('Not allowed here')));

    await userEvent.type(screen.getByLabelText(/Name/), ' (mine)');
    await userEvent.click(saveButton());

    expect(await screen.findByText('Not allowed here')).toBeInTheDocument();
    expect(onStored).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/Name/)).toHaveValue('Initial Visit (mine)');
    expect(saveBar()).toBeInTheDocument();
  });

  describe('creating', () => {
    test('says it is new and not saved yet, and starts turned off', async () => {
      await setup(null);

      expect(screen.getByText('New visit type')).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: /Untitled visit type/ })).toBeInTheDocument();
      expect(screen.getByText('Not saved yet')).toBeInTheDocument();
      expect(screen.getByText(/Nothing is created until you press Create/)).toBeInTheDocument();
      expect(within(saveBar() as HTMLElement).getByText('New visit type, not created yet')).toBeInTheDocument();
      expect(saveButton()).toHaveTextContent('Create');
      expect(screen.getByRole('switch', { name: 'Active' })).not.toBeChecked();

      await userEvent.type(screen.getByLabelText(/Name/), 'Consult');
      expect(screen.getByRole('heading', { name: /Consult/ })).toBeInTheDocument();
    });

    test('opens as an unsaved draft and creates a turned-off visit type', async () => {
      const { medplum, onStored } = await setup(null);

      expect(saveBar()).toBeInTheDocument();
      await userEvent.type(screen.getByLabelText(/Name/), 'Consult');
      await userEvent.type(parameter('duration'), '30');
      await userEvent.click(saveButton());

      await waitFor(() => expect(onStored).toHaveBeenCalled());
      expect(sentBundle(medplum).entry?.[0].request).toEqual({ method: 'POST', url: 'HealthcareService' });
      const created = lastStored(onStored);
      expect(created).toMatchObject({ name: 'Consult', active: false });
      expect(created.id).toBeDefined();
      expect(getHealthcareServiceSchedulingParameterValues(created).duration).toBe(30);
    });

    test('is refused without a name, and the field says so', async () => {
      const { medplum } = await setup(null);

      await userEvent.click(saveButton());

      expect(screen.getByLabelText(/Name/)).toHaveAttribute('aria-invalid', 'true');
      expect(screen.getByLabelText(/Name/)).toHaveAccessibleDescription('A name is required.');
      expect(medplum.executeBatch).not.toHaveBeenCalled();
    });

    test('discarding writes nothing', async () => {
      const { medplum, onDiscardNew } = await setup(null);
      await userEvent.type(screen.getByLabelText(/Name/), 'Consult');

      await userEvent.click(within(saveBar() as HTMLElement).getByRole('button', { name: 'Discard' }));

      expect(onDiscardNew).toHaveBeenCalled();
      expect(medplum.executeBatch).not.toHaveBeenCalled();
    });
  });

  describe('service facilities', () => {
    installAutocompleteTimers();

    function picker(): HTMLElement {
      return screen.getByRole('searchbox', { name: 'Service facilities' });
    }

    async function pick(name: string): Promise<void> {
      await typeInAutocomplete(picker(), name.split(' ')[0]);
      await clickAutocompleteOption(name);
    }

    function chips(): HTMLElement {
      return screen.getByTestId('selected-items');
    }

    async function save(): Promise<void> {
      await act(async () => {
        fireEvent.click(saveButton());
      });
    }

    test('restricting a visit type offered everywhere asks first, and cancelling changes nothing', async () => {
      await setup();

      await pick('Downtown Clinic');

      const dialog = await screen.findByRole('dialog', { name: 'Offer Initial Visit only at Downtown Clinic?' });
      await act(async () => {
        fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
      });
      expect(picker()).toHaveAttribute('placeholder', 'Offered at every service facility');
      expect(screen.queryByText('Downtown Clinic')).not.toBeInTheDocument();
      expect(saveBar()).toBeNull();
    });

    test('holds a visit type at the service facilities added', async () => {
      const { onStored } = await setup();

      await pick('Downtown Clinic');
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Limit to Downtown Clinic' }));
      });
      expect(picker()).toHaveAttribute('placeholder', 'Add a service facility');
      await pick('Northside');
      await save();

      await waitFor(() => expect(onStored).toHaveBeenCalled());
      expect(lastStored(onStored).location?.map((location) => location.reference)).toEqual([
        'Location/downtown',
        'Location/northside',
      ]);
    });

    test('Discard takes an added service facility off the field as well as the draft', async () => {
      await setup({ ...initialVisit, location: [{ reference: 'Location/downtown', display: 'Downtown Clinic' }] });
      await settleAutocomplete();

      await pick('Northside');
      expect(chips()).toHaveTextContent('Northside');
      await act(async () => {
        fireEvent.click(within(saveBar() as HTMLElement).getByRole('button', { name: 'Discard' }));
      });
      await settleAutocomplete();

      expect(chips()).not.toHaveTextContent('Northside');
      expect(chips()).toHaveTextContent('Downtown Clinic');
      expect(saveBar()).toBeNull();
    });

    test('clearing several service facilities at once asks before offering it everywhere', async () => {
      await setup({
        ...initialVisit,
        name: 'Cystoscopy',
        location: [
          { reference: 'Location/downtown', display: 'Downtown Clinic' },
          { reference: 'Location/northside', display: 'Northside' },
        ],
      });
      await settleAutocomplete();

      await act(async () => {
        fireEvent.click(screen.getByTitle('Clear all'));
      });

      const dialog = await screen.findByRole('dialog', { name: 'Offer Cystoscopy at every service facility?' });
      expect(dialog).toHaveTextContent('That leaves no service facilities listed');
    });

    test('removing the last service facility asks first, then offers it everywhere', async () => {
      const { onStored } = await setup({
        ...initialVisit,
        name: 'Cystoscopy',
        location: [{ reference: 'Location/downtown', display: 'Downtown Clinic' }],
      });

      // The input looks the stored reference up after it mounts.
      await settleAutocomplete();
      await removePill('Downtown Clinic');
      const dialog = await screen.findByRole('dialog', { name: 'Offer Cystoscopy at every service facility?' });
      await act(async () => {
        fireEvent.click(within(dialog).getByRole('button', { name: 'Offer everywhere' }));
      });
      expect(picker()).toHaveAttribute('placeholder', 'Offered at every service facility');
      await save();

      await waitFor(() => expect(onStored).toHaveBeenCalled());
      expect(lastStored(onStored).location).toBeUndefined();
    });
  });
});
