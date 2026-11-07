// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { Notifications, notifications } from '@mantine/notifications';
import type { WithId } from '@medplum/core';
import type { ActivityDefinition, Bundle, CodeSystem, Parameters, PlanDefinition, ValueSet } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { GetStartedPage } from './GetStartedPage';

// A batch response whose entries the page counts by 2xx status.
function batchResponse(...statuses: string[]): Bundle {
  return {
    resourceType: 'Bundle',
    type: 'transaction-response',
    entry: statuses.map((status) => ({ response: { status } })),
  };
}

// A `$sync-orderset` response reporting one medication that failed to reach the vendor.
function partialSyncResponse(): Parameters {
  return {
    resourceType: 'Parameters',
    parameter: [
      { name: 'mode', valueString: 'created' },
      { name: 'syncedCount', valueInteger: 1 },
      { name: 'failedCount', valueInteger: 1 },
      {
        name: 'results',
        part: [
          { name: 'status', valueString: 'failed' },
          { name: 'actionTitle', valueString: 'Metformin 500 mg' },
        ],
      },
    ],
  };
}

describe('GetStartedPage', () => {
  let medplum: MockClient;

  beforeEach(() => {
    medplum = new MockClient();
    vi.clearAllMocks();
    // The notification store is global and its display limit is shared, so leftovers from an
    // earlier test would queue this test's notification instead of rendering it.
    notifications.clean();
    notifications.cleanQueue();
  });

  function setup(): ReturnType<typeof render> {
    return render(
      <MemoryRouter>
        <MedplumProvider medplum={medplum}>
          <MantineProvider>
            <Notifications />
            <GetStartedPage />
          </MantineProvider>
        </MedplumProvider>
      </MemoryRouter>
    );
  }

  describe('Page content', () => {
    test('Introduces the recommended first steps', () => {
      setup();
      expect(screen.getByText('Get Started with Medplum Provider')).toBeInTheDocument();
      expect(screen.getByText('Import Sample Data')).toBeInTheDocument();
      expect(screen.getByText('Integrate Your Services')).toBeInTheDocument();
      expect(screen.getByText('View Our User Guide')).toBeInTheDocument();
      expect(screen.getByText('Get Help')).toBeInTheDocument();
    });

    test('Names each sample dataset', () => {
      setup();
      expect(screen.getByText('David James Williams')).toBeInTheDocument();
      expect(screen.getByText('Simple Initial Visit + Billing')).toBeInTheDocument();
      expect(screen.getByText('ICD-10-CM Billable Codes')).toBeInTheDocument();
      expect(screen.getByText('Procedure Modifiers')).toBeInTheDocument();
      expect(screen.getByText('Geriatric T2DM Starter')).toBeInTheDocument();
    });

    test('Marks the datasets that are not ready yet', () => {
      setup();
      const comingSoon = screen.getAllByRole('button', { name: 'Coming Soon' });
      expect(comingSoon).toHaveLength(2);
      comingSoon.forEach((button) => expect(button).toBeDisabled());
    });

    test('Links out for integrations, docs, and support', () => {
      setup();
      expect(screen.getByRole('link', { name: /View All Integrations/ })).toHaveAttribute('href', '/integrations');
      expect(screen.getByRole('link', { name: /Join Medplum Discord/ })).toHaveAttribute(
        'href',
        'https://discord.gg/medplum'
      );
      expect(screen.getByRole('link', { name: /Contact Support/ })).toHaveAttribute(
        'href',
        'mailto:support@medplum.com'
      );
      expect(screen.getByRole('link', { name: 'Subscribe' })).toHaveAttribute(
        'href',
        'https://www.medplum.com/pricing'
      );
    });
  });

  describe('Sample patient', () => {
    test('Imports the patient as a transaction and counts what landed', async () => {
      const executeBatch = vi.spyOn(medplum, 'executeBatch').mockResolvedValue(batchResponse('201', '200', '400'));
      setup();

      await userEvent.click(screen.getByRole('button', { name: 'Import Patient' }));

      expect(await screen.findByText('Imported 2 resources for patient David James Williams')).toBeInTheDocument();
      // The bundle ships as a searchset, which the server will not accept as-is.
      expect(executeBatch.mock.calls[0][0].type).toBe('transaction');
      expect(executeBatch.mock.calls[0][0].entry?.[0].request?.method).toBeDefined();
    });

    test('Counts nothing when the response has no entries', async () => {
      vi.spyOn(medplum, 'executeBatch').mockResolvedValue({ resourceType: 'Bundle', type: 'transaction-response' });
      setup();

      await userEvent.click(screen.getByRole('button', { name: 'Import Patient' }));

      expect(await screen.findByText('Imported 0 resources for patient David James Williams')).toBeInTheDocument();
    });

    test('Reports a failed import', async () => {
      vi.spyOn(medplum, 'executeBatch').mockRejectedValue(new Error('Batch rejected'));
      setup();

      await userEvent.click(screen.getByRole('button', { name: 'Import Patient' }));

      expect(await screen.findByText('Batch rejected')).toBeInTheDocument();
    });

    test('Shows progress while importing', async () => {
      let resolveBatch: (value: Bundle) => void = () => undefined;
      vi.spyOn(medplum, 'executeBatch').mockReturnValue(
        new Promise<Bundle>((resolve) => {
          resolveBatch = resolve;
        })
      );
      setup();

      await userEvent.click(screen.getByRole('button', { name: 'Import Patient' }));

      const importing = await screen.findByRole('button', { name: 'Importing...' });
      expect(importing).toBeDisabled();
      resolveBatch(batchResponse('201'));
      await waitFor(() => expect(screen.getByRole('button', { name: 'Import Patient' })).toBeEnabled());
    });
  });

  describe('Care template', () => {
    test('Sends the visit bundle as it already is', async () => {
      const executeBatch = vi.spyOn(medplum, 'executeBatch').mockResolvedValue(batchResponse('201', '201'));
      setup();

      await userEvent.click(screen.getByRole('button', { name: 'Import Care Template' }));

      expect(
        await screen.findByText('Imported 2 resources for Simple Initial Visit + Billing template')
      ).toBeInTheDocument();
      // Already a transaction bundle, so it is posted unconverted.
      expect(executeBatch.mock.calls[0][0].type).toBe('transaction');
      expect(executeBatch.mock.calls[0][0].entry?.length).toBeGreaterThan(0);
    });

    test('Deletes earlier copies of the template before importing', async () => {
      const stale = await medplum.createResource<ActivityDefinition>({
        resourceType: 'ActivityDefinition',
        status: 'active',
        url: 'https://www.medplum.com/activitydefinition/venipuncture',
      });
      const stalePlan = await medplum.createResource<PlanDefinition>({
        resourceType: 'PlanDefinition',
        status: 'active',
        url: 'https://www.medplum.com/plandefinition/simple-initial-visit',
      });
      const executeBatch = vi.spyOn(medplum, 'executeBatch').mockResolvedValue(batchResponse('201', '201'));
      setup();

      await userEvent.click(screen.getByRole('button', { name: 'Import Care Template' }));

      expect(
        await screen.findByText(
          'Imported 2 resources for Simple Initial Visit + Billing template (replaced 2 existing)'
        )
      ).toBeInTheDocument();
      const deletes = executeBatch.mock.calls[0][0].entry?.map((e) => e.request);
      expect(deletes).toEqual(
        expect.arrayContaining([
          { method: 'DELETE', url: `ActivityDefinition/${stale.id}` },
          { method: 'DELETE', url: `PlanDefinition/${stalePlan.id}` },
        ])
      );
      expect(deletes).toHaveLength(2);
      expect(executeBatch.mock.calls[1][0].entry?.[0].resource?.resourceType).toBe('ActivityDefinition');
    });

    test('Reports a failed import', async () => {
      vi.spyOn(medplum, 'executeBatch').mockRejectedValue(new Error('Care template rejected'));
      setup();

      await userEvent.click(screen.getByRole('button', { name: 'Import Care Template' }));

      expect(await screen.findByText('Care template rejected')).toBeInTheDocument();
    });
  });

  describe('Empty responses', () => {
    test('Counts nothing for a care template or order set with no entries', async () => {
      vi.spyOn(medplum, 'executeBatch').mockResolvedValue({ resourceType: 'Bundle', type: 'transaction-response' });
      setup();

      await userEvent.click(screen.getByRole('button', { name: 'Import Care Template' }));
      expect(
        await screen.findByText('Imported 0 resources for Simple Initial Visit + Billing template')
      ).toBeInTheDocument();

      await userEvent.click(screen.getByRole('button', { name: 'Import Order Set' }));
      expect(await screen.findByText('Imported 0 resources for Geriatric T2DM Order Set')).toBeInTheDocument();
    });
  });

  // The server only honors a ValueSet's term-type filter when the CodeSystem declares the `tty` property.
  function loadCodeSystem(url: string, withTermTypes: boolean): Promise<WithId<CodeSystem>> {
    return medplum.createResource<CodeSystem>({
      resourceType: 'CodeSystem',
      status: 'active',
      content: 'example',
      url,
      property: withTermTypes ? [{ code: 'tty', type: 'code' }] : undefined,
    });
  }

  function registerStaleValueSet(url: string): Promise<WithId<ValueSet>> {
    return medplum.createResource<ValueSet>({ resourceType: 'ValueSet', status: 'draft', url, name: 'stale' });
  }

  function findValueSets(url: string): Promise<WithId<ValueSet>[]> {
    return medplum.searchResources('ValueSet', { url }, { cache: 'no-cache' });
  }

  describe('ICD-10 ValueSet', () => {
    const ICD10_URL = 'http://hl7.org/fhir/sid/icd-10-cm';
    const ICD10_BILLABLE_URL = 'http://hl7.org/fhir/sid/icd-10-cm/vs/billable';

    test('Disables the import until an ICD-10-CM CodeSystem declaring term types is loaded', async () => {
      await loadCodeSystem(ICD10_URL, false);
      setup();

      const button = await screen.findByRole('button', { name: 'ICD-10 codes not installed' });
      expect(button).toBeDisabled();

      await userEvent.hover(button.parentElement as HTMLElement);
      expect(await screen.findByText(`CodeSystem ${ICD10_URL} required`)).toBeInTheDocument();
    });

    test('Replaces every ValueSet already registered under the billable codes url', async () => {
      await loadCodeSystem(ICD10_URL, true);
      await registerStaleValueSet(ICD10_BILLABLE_URL);
      await registerStaleValueSet(ICD10_BILLABLE_URL);
      setup();

      const button = screen.getByRole('button', { name: 'Import ValueSet' });
      await waitFor(() => expect(button).toBeEnabled());
      await userEvent.click(button);

      expect(await screen.findByText('ICD-10-CM Billable Codes ValueSet ready')).toBeInTheDocument();
      const valueSets = await findValueSets(ICD10_BILLABLE_URL);
      expect(valueSets).toHaveLength(1);
      expect(valueSets[0].name).toBe('icd10cm-billable');
      expect(valueSets[0].compose?.include[0].filter?.[0]).toEqual({ property: 'tty', op: '=', value: 'PT' });
    });

    test('Reports a failed install', async () => {
      await loadCodeSystem(ICD10_URL, true);
      vi.spyOn(medplum, 'createResource').mockRejectedValue(new Error('ValueSet not permitted on this plan'));
      setup();

      const button = screen.getByRole('button', { name: 'Import ValueSet' });
      await waitFor(() => expect(button).toBeEnabled());
      await userEvent.click(button);

      expect(await screen.findByText('ValueSet not permitted on this plan')).toBeInTheDocument();
    });
  });

  describe('Procedure modifiers ValueSet', () => {
    const CPT_URL = 'http://www.ama-assn.org/go/cpt';
    const PROCEDURE_MODIFIERS_URL = 'https://medplum.com/fhir/ValueSet/procedure-modifiers';

    test('Disables the import until a CPT CodeSystem declaring term types is loaded', async () => {
      await loadCodeSystem(CPT_URL, false);
      setup();

      const button = await screen.findByRole('button', { name: 'Procedure codes not installed' });
      expect(button).toBeDisabled();

      await userEvent.hover(button.parentElement as HTMLElement);
      expect(await screen.findByText(`CodeSystem ${CPT_URL} required`)).toBeInTheDocument();
    });

    test('Installs the modifiers ValueSet selecting CPT modifier concepts when none is registered', async () => {
      await loadCodeSystem(CPT_URL, true);
      setup();

      const button = screen.getByRole('button', { name: 'Import Modifiers' });
      await waitFor(() => expect(button).toBeEnabled());
      await userEvent.click(button);

      expect(await screen.findByText('Procedure Modifiers ValueSet ready')).toBeInTheDocument();
      const valueSets = await findValueSets(PROCEDURE_MODIFIERS_URL);
      expect(valueSets).toHaveLength(1);
      expect(valueSets[0].compose?.include[0]).toEqual({
        system: CPT_URL,
        filter: [{ property: 'tty', op: '=', value: 'MP' }],
      });
    });

    test('Replaces a ValueSet already registered under the modifiers url', async () => {
      await loadCodeSystem(CPT_URL, true);
      const stale = await registerStaleValueSet(PROCEDURE_MODIFIERS_URL);
      setup();

      const button = screen.getByRole('button', { name: 'Import Modifiers' });
      await waitFor(() => expect(button).toBeEnabled());
      await userEvent.click(button);

      expect(await screen.findByText('Procedure Modifiers ValueSet ready')).toBeInTheDocument();
      const valueSets = await findValueSets(PROCEDURE_MODIFIERS_URL);
      expect(valueSets).toHaveLength(1);
      expect(valueSets[0].id).not.toBe(stale.id);
      expect(valueSets[0].name).toBe('procedure-modifiers');
    });

    test('Reports a failed install', async () => {
      await loadCodeSystem(CPT_URL, true);
      vi.spyOn(medplum, 'createResource').mockRejectedValue(new Error('ValueSet not permitted on this plan'));
      setup();

      const button = screen.getByRole('button', { name: 'Import Modifiers' });
      await waitFor(() => expect(button).toBeEnabled());
      await userEvent.click(button);

      expect(await screen.findByText('ValueSet not permitted on this plan')).toBeInTheDocument();
    });
  });

  describe('Order set', () => {
    test('Syncs the imported PlanDefinition to the e-prescribing vendor', async () => {
      vi.spyOn(medplum, 'executeBatch').mockResolvedValue({
        resourceType: 'Bundle',
        type: 'transaction-response',
        entry: [
          { response: { status: '201', location: 'ActivityDefinition/ad-1' } },
          { response: { status: '201', location: 'PlanDefinition/pd-1' } },
        ],
      });
      const post = vi.spyOn(medplum, 'post').mockResolvedValue({
        resourceType: 'Parameters',
        parameter: [
          { name: 'mode', valueString: 'created' },
          { name: 'syncedCount', valueInteger: 2 },
          { name: 'failedCount', valueInteger: 0 },
        ],
      });
      setup();

      await userEvent.click(screen.getByRole('button', { name: 'Import Order Set' }));

      expect(await screen.findByText('Imported 2 resources for Geriatric T2DM Order Set')).toBeInTheDocument();
      expect(post).toHaveBeenCalledWith(
        expect.objectContaining({ pathname: expect.stringContaining('$sync-orderset') }),
        { planDefinitionId: 'pd-1', organizationId: undefined }
      );
    });

    test('Warns when only some medications reached the vendor', async () => {
      vi.spyOn(medplum, 'executeBatch').mockResolvedValue({
        resourceType: 'Bundle',
        type: 'transaction-response',
        entry: [{ response: { status: '201', location: 'PlanDefinition/pd-1' } }],
      });
      vi.spyOn(medplum, 'post').mockResolvedValue(partialSyncResponse());
      setup();

      await userEvent.click(screen.getByRole('button', { name: 'Import Order Set' }));

      expect(await screen.findByText('Order set partially synced')).toBeInTheDocument();
      expect(screen.getByText(/Metformin 500 mg/)).toBeInTheDocument();
    });

    test('Skips the sync when the import created no PlanDefinition', async () => {
      vi.spyOn(medplum, 'executeBatch').mockResolvedValue({
        resourceType: 'Bundle',
        type: 'transaction-response',
        entry: [{ response: { status: '201', location: 'ActivityDefinition/ad-1' } }],
      });
      const post = vi.spyOn(medplum, 'post');
      setup();

      await userEvent.click(screen.getByRole('button', { name: 'Import Order Set' }));

      expect(await screen.findByText('Imported 1 resources for Geriatric T2DM Order Set')).toBeInTheDocument();
      expect(post).not.toHaveBeenCalled();
    });

    test('Reports a failed import', async () => {
      vi.spyOn(medplum, 'executeBatch').mockRejectedValue(new Error('Order set rejected'));
      setup();

      await userEvent.click(screen.getByRole('button', { name: 'Import Order Set' }));

      expect(await screen.findByText('Order set rejected')).toBeInTheDocument();
    });
  });
});
