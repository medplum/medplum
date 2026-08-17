// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import type { WithId } from '@medplum/core';
import type {
  AllergyIntolerance,
  Bundle,
  Parameters,
  ParametersParameter,
  Patient,
  Resource,
} from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import type * as MedplumReact from '@medplum/react';
import { MedplumProvider } from '@medplum/react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { SmartHealthLinkImport } from './SmartHealthLinkImport';

// Stand in for the camera so the scan path can be driven without a device. Everything else
// from @medplum/react is left alone.
vi.mock('@medplum/react', async (importOriginal) => {
  const actual = await importOriginal<typeof MedplumReact>();
  return {
    ...actual,
    QrCodeScanner: ({ onScan }: { onScan: (data: string) => void }) => (
      <button type="button" onClick={() => onScan(SCANNED_CARD_QR)}>
        simulate-scan
      </button>
    ),
  };
});

// A card delivered as a SMART Health Link QR - the payload resolves to a plain Bundle, so
// nothing about the value or the response says "card". Only the scan entry point does.
const SCANNED_CARD_QR =
  'shlink:/eyJ1cmwiOiJodHRwczovL2lzc3Vlci5leGFtcGxlLmNvbS9wYXlsb2FkIiwiZmxhZyI6IlUiLCJrZXkiOiJBQUVDQXdRRkJnY0lDUW9MREEwT0R4QVJFaE1VRlJZWEdCa2FHeHdkSGg4IiwiZXhwIjoxMDAwMDAwMDAwLCJ2IjoxfQ==';

const SHARED_PATIENT: Patient = {
  resourceType: 'Patient',
  id: 'shared-patient',
  name: [{ given: ['Homer'], family: 'Simpson' }],
  birthDate: '1988-01-01',
};

const SHARED_ALLERGY: AllergyIntolerance = {
  resourceType: 'AllergyIntolerance',
  id: 'shared-allergy',
  patient: { reference: 'Patient/shared-patient' },
  code: { text: 'Peanuts' },
};

const SHARED_BUNDLE: Bundle = {
  resourceType: 'Bundle',
  type: 'collection',
  entry: [
    { resource: SHARED_PATIENT },
    { resource: SHARED_ALLERGY },
    {
      resource: {
        resourceType: 'Observation',
        id: 'shared-observation',
        status: 'final',
        subject: { reference: 'Patient/shared-patient' },
        code: { text: 'Hemoglobin A1c' },
      },
    },
  ],
};

const LOCAL_PATIENT: WithId<Patient> = {
  resourceType: 'Patient',
  id: 'local-patient',
  name: [{ given: ['Homer', 'J'], family: 'Simpson' }],
  birthDate: '1988-01-01',
};

const EXPIRED_SHLINK = SCANNED_CARD_QR;

// A successful resolve response.
function resolveResponse(resources: unknown[] = [SHARED_BUNDLE], extra: ParametersParameter[] = []): Parameters {
  return {
    resourceType: 'Parameters',
    parameter: [
      { name: 'valid', valueBoolean: true },
      { name: 'sourceOrigin', valueString: 'https://issuer.example.com' },
      { name: 'fhirResources', valueString: JSON.stringify(resources) },
      ...extra,
    ],
  };
}

// A resolve response for a link whose expiration has passed but whose records came back.
function expiredButAvailableResponse(): Parameters {
  return resolveResponse(
    [SHARED_BUNDLE],
    [
      { name: 'expiresAt', valueDateTime: new Date(Date.now() - 60_000).toISOString() },
      { name: 'warning', valueString: 'SMART Health Link is expired. Content was still available and decrypted.' },
    ]
  );
}

interface MatchCandidate {
  readonly patient: WithId<Patient>;
  readonly grade?: string;
  readonly score?: number;
}

// A `Patient/$match` response, whose grades drive whether the flow pre-selects a destination.
function matchResponse(...candidates: MatchCandidate[]): Bundle<WithId<Patient>> {
  return {
    resourceType: 'Bundle',
    type: 'searchset',
    entry: candidates.map(({ patient, grade, score }) => ({
      resource: patient,
      search: {
        mode: 'match',
        score,
        extension: grade
          ? [{ url: 'http://hl7.org/fhir/StructureDefinition/match-grade', valueCode: grade }]
          : undefined,
      },
    })),
  };
}

describe('SmartHealthLinkImport', () => {
  let medplum: MockClient;

  beforeEach(() => {
    medplum = new MockClient();
    vi.clearAllMocks();
  });

  function setup(onImported?: (patient: WithId<Patient>) => void): ReturnType<typeof render> {
    return render(
      <MemoryRouter>
        <MedplumProvider medplum={medplum}>
          <MantineProvider>
            <Notifications />
            <SmartHealthLinkImport onImported={onImported} />
          </MantineProvider>
        </MedplumProvider>
      </MemoryRouter>
    );
  }

  // Routes the flow's three operation calls, so a test only has to state the responses it cares
  // about. `$match` defaults to no candidates.
  function mockOperations(responses: {
    resolve?: Parameters | Error;
    verify?: Parameters;
    match?: Bundle<WithId<Patient>>;
  }): void {
    vi.spyOn(medplum, 'post').mockImplementation(async (url: string | URL) => {
      const path = String(url);
      if (path.includes('$resolve-smart-health-link')) {
        if (responses.resolve instanceof Error) {
          throw responses.resolve;
        }
        return responses.resolve ?? resolveResponse();
      }
      if (path.includes('$verify-smart-health-card')) {
        return responses.verify;
      }
      if (path.includes('$match')) {
        return responses.match ?? matchResponse();
      }
      throw new Error(`Unexpected operation: ${path}`);
    });
  }

  async function resolveLink(value: string = EXPIRED_SHLINK): Promise<void> {
    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText(/shlink/i), value);
    await user.click(screen.getByRole('button', { name: /open smart health link/i }));
  }

  // Renders, resolves a link, and waits for the Select Patient step.
  async function goToPatientStep(onImported?: (patient: WithId<Patient>) => void): Promise<void> {
    setup(onImported);
    await resolveLink();
    await screen.findByText('Select or Create a Patient for Records Import');
  }

  // Renders, resolves a link, and continues on to the Import Records step.
  async function goToRecordsStep(onImported?: (patient: WithId<Patient>) => void): Promise<void> {
    await goToPatientStep(onImported);
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await screen.findByText(/Select Records to Import/);
  }

  describe('Resolving a link', () => {
    test('Requires a link before calling the server', async () => {
      mockOperations({});
      setup();

      await userEvent.click(screen.getByRole('button', { name: /open smart health link/i }));

      expect(screen.getByText('Enter a SMART Health Link.')).toBeInTheDocument();
      expect(medplum.post).not.toHaveBeenCalled();
    });

    test('Trims the pasted link and names the project as the recipient', async () => {
      mockOperations({});
      setup();
      await resolveLink('  shlink:/padded  ');

      await screen.findByText('Select or Create a Patient for Records Import');
      expect(medplum.post).toHaveBeenCalledWith(
        expect.anything(),
        { shlink: 'shlink:/padded', recipient: 'Project 123' },
        expect.anything()
      );
    });

    test('Falls back to a generic recipient outside a project', async () => {
      vi.spyOn(medplum, 'getProject').mockReturnValue(undefined);
      mockOperations({});
      setup();
      await resolveLink('shlink:/abc');

      await screen.findByText('Select or Create a Patient for Records Import');
      expect(medplum.post).toHaveBeenCalledWith(
        expect.anything(),
        { shlink: 'shlink:/abc', recipient: 'Project' },
        expect.anything()
      );
    });

    test('Surfaces the default message when the server reports no reason', async () => {
      mockOperations({
        resolve: { resourceType: 'Parameters', parameter: [{ name: 'valid', valueBoolean: false }] },
      });
      setup();
      await resolveLink();

      expect(await screen.findByText('SMART Health Link could not be resolved.')).toBeInTheDocument();
      expect(screen.queryByText('Select or Create a Patient for Records Import')).not.toBeInTheDocument();
    });

    test('Surfaces the server error when an expired link is no longer available', async () => {
      mockOperations({
        resolve: {
          resourceType: 'Parameters',
          parameter: [
            { name: 'valid', valueBoolean: false },
            { name: 'error', valueString: 'SMART Health Link payload request failed with HTTP 404' },
          ],
        },
      });
      setup();
      await resolveLink();

      await waitFor(() => {
        expect(screen.getByText(/failed with HTTP 404/i)).toBeInTheDocument();
      });
      expect(screen.queryByText('Select or Create a Patient for Records Import')).not.toBeInTheDocument();
    });

    test('Rejects a payload carrying neither a Bundle nor a card', async () => {
      mockOperations({ resolve: resolveResponse([{ resourceType: 'Practitioner' }]) });
      setup();
      await resolveLink();

      expect(
        await screen.findByText('SMART Health Link did not contain a FHIR Bundle or SMART Health Card file.')
      ).toBeInTheDocument();
    });

    test('Rejects a Bundle without a Patient', async () => {
      mockOperations({
        resolve: resolveResponse([
          { resourceType: 'Bundle', type: 'collection', entry: [{ resource: SHARED_ALLERGY }] },
        ]),
      });
      setup();
      await resolveLink();

      expect(
        await screen.findByText('SMART Health Link Bundle did not contain a Patient resource.')
      ).toBeInTheDocument();
    });

    test('Surfaces a card that fails verification', async () => {
      mockOperations({
        resolve: resolveResponse([{ verifiableCredential: ['fake.jwt.payload'] }]),
        verify: {
          resourceType: 'Parameters',
          parameter: [
            { name: 'valid', valueBoolean: false },
            { name: 'error', valueString: 'SMART Health Card signature is invalid.' },
          ],
        },
      });
      setup();
      await resolveLink();

      expect(await screen.findByText('SMART Health Card signature is invalid.')).toBeInTheDocument();
    });

    test('Requires a Bundle in a verified card', async () => {
      mockOperations({
        resolve: resolveResponse([{ verifiableCredential: ['fake.jwt.payload'] }]),
        verify: { resourceType: 'Parameters', parameter: [{ name: 'valid', valueBoolean: true }] },
      });
      setup();
      await resolveLink();

      expect(await screen.findByText('SMART Health Card did not contain a FHIR Bundle.')).toBeInTheDocument();
    });

    test('Shows non-expiry warnings in the warning banner', async () => {
      mockOperations({
        resolve: resolveResponse(
          [SHARED_BUNDLE],
          [{ name: 'warning', valueString: 'Issuer is not in the trusted directory.' }]
        ),
      });
      await goToPatientStep();

      expect(screen.getByText('Issuer is not in the trusted directory.')).toBeInTheDocument();
    });

    test('Re-arms the scanner after a failed scan', async () => {
      mockOperations({ resolve: new Error('Network request failed') });
      setup();

      await userEvent.click(screen.getByRole('button', { name: /scan smart health card/i }));
      await userEvent.click(await screen.findByRole('button', { name: 'simulate-scan' }));

      // The camera stays up with the error beneath it, ready for another attempt.
      expect(await screen.findByText('Network request failed')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'simulate-scan' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    });

    test('Leaves the scan view when a scanned card resolves', async () => {
      mockOperations({});
      setup();

      await userEvent.click(screen.getByRole('button', { name: /scan smart health card/i }));
      await userEvent.click(await screen.findByRole('button', { name: 'simulate-scan' }));

      await screen.findByText('Select or Create a Patient for Records Import');
      expect(screen.queryByRole('button', { name: 'simulate-scan' })).not.toBeInTheDocument();
    });

    test('Clears the pasted link and error when a scan is cancelled', async () => {
      mockOperations({});
      setup();
      await userEvent.type(screen.getByPlaceholderText(/shlink/i), 'shlink:/abc');

      await userEvent.click(screen.getByRole('button', { name: /scan smart health card/i }));
      await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

      expect(screen.getByPlaceholderText(/shlink/i)).toHaveValue('');
    });
  });

  describe('Expired links', () => {
    test('Advances past an expired link instead of blocking it', async () => {
      mockOperations({ resolve: expiredButAvailableResponse() });
      setup();
      await resolveLink();

      // Reaching the Select Patient step at all proves expiry no longer short-circuits.
      await waitFor(() => {
        expect(screen.getByText('Select or Create a Patient for Records Import')).toBeInTheDocument();
      });
      expect(screen.queryByText('This SMART Health Link has expired.')).not.toBeInTheDocument();
    });

    test('Shows the expiry notice below the expiration row, still inside the details section', async () => {
      mockOperations({ resolve: expiredButAvailableResponse() });
      setup();
      await resolveLink();

      const notice = await screen.findByText(/expired, but its records are still available/i);
      const expirationLabel = screen.getByText('Records Sharing Expiration');
      const patientSection = screen.getByText('Select or Create a Patient for Records Import');
      const sectionDivider = document.querySelector('[class*="sectionDivider"]');
      expect(sectionDivider).not.toBeNull();

      // Order must be: expiration row -> notice -> section divider -> patient section, so the
      // notice reads as part of the link details rather than as a heading for the next section.
      expect(expirationLabel.compareDocumentPosition(notice)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
      expect(notice.compareDocumentPosition(sectionDivider as Node)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
      expect(notice.compareDocumentPosition(patientSection)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    });

    test('Says "link" for a link and titles the details section accordingly', async () => {
      mockOperations({ resolve: expiredButAvailableResponse() });
      setup();
      await resolveLink();

      expect(await screen.findByText(/^This link has expired/)).toBeInTheDocument();
      expect(screen.getByText('SMART Health Link Details')).toBeInTheDocument();
    });

    test('Says "card" when the input itself is a card QR payload', async () => {
      mockOperations({ resolve: expiredButAvailableResponse() });
      setup();
      await resolveLink('shc:/567629095243206034602924374044603122295953265460346029240');

      expect(await screen.findByText(/^This card has expired/)).toBeInTheDocument();
      expect(screen.getByText('SMART Health Card Details')).toBeInTheDocument();
    });

    test('Says "card" when scanned, even if the payload resolves to a plain Bundle', async () => {
      mockOperations({ resolve: expiredButAvailableResponse() });
      const user = userEvent.setup();
      setup();

      await user.click(screen.getByRole('button', { name: /scan smart health card/i }));
      await user.click(await screen.findByRole('button', { name: 'simulate-scan' }));

      expect(await screen.findByText(/^This card has expired/)).toBeInTheDocument();
      expect(screen.getByText('SMART Health Card Details')).toBeInTheDocument();
    });

    test('Says "card" when a shlink resolves to a SMART Health Card file', async () => {
      // The common scan path: the QR is a shlink:, but its payload is a verifiable
      // credential rather than a plain Bundle, so this is still a card to the user.
      mockOperations({
        resolve: resolveResponse(
          [{ verifiableCredential: ['fake.jwt.payload'] }],
          [{ name: 'expiresAt', valueDateTime: new Date(Date.now() - 60_000).toISOString() }]
        ),
        verify: {
          resourceType: 'Parameters',
          parameter: [
            { name: 'valid', valueBoolean: true },
            { name: 'fhirBundle', valueString: JSON.stringify(SHARED_BUNDLE) },
          ],
        },
      });
      setup();
      await resolveLink();

      expect(await screen.findByText(/^This card has expired/)).toBeInTheDocument();
      expect(screen.getByText('SMART Health Card Details')).toBeInTheDocument();
    });

    test('Uses a red alert rather than yellow', async () => {
      mockOperations({ resolve: expiredButAvailableResponse() });
      setup();
      await resolveLink();

      const notice = await screen.findByText(/^This link has expired/);
      const alert = notice.closest('[class*="mantine-Alert-root"]');
      expect(alert).not.toBeNull();
      expect(alert?.getAttribute('class')).toMatch(/expiredAlert/);
      expect(getComputedStyle(alert as Element).getPropertyValue('--alert-bg')).toContain('red');
    });

    test('Does not repeat the expiry warning in the generic warning banner', async () => {
      mockOperations({ resolve: expiredButAvailableResponse() });
      setup();
      await resolveLink();

      await screen.findByText(/expired, but its records are still available/i);
      expect(screen.queryByText(/Content was still available and decrypted/i)).not.toBeInTheDocument();
    });
  });

  describe('Choosing a destination patient', () => {
    test('Pre-selects a certain match', async () => {
      mockOperations({ match: matchResponse({ patient: LOCAL_PATIENT, grade: 'certain', score: 0.95 }) });
      await goToPatientStep();

      const options = screen.getAllByRole('radio');
      expect(options[0]).toHaveAttribute('aria-checked', 'true');
      expect(screen.getByText('Certain Match')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled();
    });

    test('Defaults to creating a patient when nothing matched', async () => {
      mockOperations({});
      await goToPatientStep();

      expect(screen.getByText('(No existing patient matches found)')).toBeInTheDocument();
      const options = screen.getAllByRole('radio');
      expect(options).toHaveLength(1);
      expect(options[0]).toHaveAttribute('aria-checked', 'true');
      expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled();
    });

    test('Leaves an uncertain match for the user to confirm', async () => {
      mockOperations({ match: matchResponse({ patient: LOCAL_PATIENT, grade: 'possible', score: 0.6 }) });
      await goToPatientStep();

      const options = screen.getAllByRole('radio');
      expect(options[0]).toHaveAttribute('aria-checked', 'false');
      expect(options[1]).toHaveAttribute('aria-checked', 'false');
      expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();

      await userEvent.click(options[0]);
      expect(screen.getAllByRole('radio')[0]).toHaveAttribute('aria-checked', 'true');
      expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled();
    });

    test('Switches from a match to a new patient and back', async () => {
      mockOperations({ match: matchResponse({ patient: LOCAL_PATIENT, grade: 'certain' }) });
      await goToPatientStep();

      await userEvent.click(screen.getAllByRole('radio')[1]);
      expect(screen.getAllByRole('radio')[0]).toHaveAttribute('aria-checked', 'false');
      expect(screen.getAllByRole('radio')[1]).toHaveAttribute('aria-checked', 'true');

      await userEvent.click(screen.getAllByRole('radio')[0]);
      expect(screen.getAllByRole('radio')[0]).toHaveAttribute('aria-checked', 'true');
      expect(screen.getAllByRole('radio')[1]).toHaveAttribute('aria-checked', 'false');
    });

    test('Counts only the importable records as shared', async () => {
      mockOperations({});
      await goToPatientStep();

      // The Patient itself is the destination, not an importable record.
      const sharedCount = screen.getByText('Records Shared').nextElementSibling;
      expect(sharedCount).toHaveTextContent('2');
    });

    test('Omits the details it was not given', async () => {
      mockOperations({
        resolve: {
          resourceType: 'Parameters',
          parameter: [
            { name: 'valid', valueBoolean: true },
            { name: 'fhirResources', valueString: JSON.stringify([SHARED_BUNDLE]) },
          ],
        },
      });
      await goToPatientStep();

      // Both Source and Records Sharing Expiration are unknown.
      expect(screen.getAllByText('—')).toHaveLength(2);
    });
  });

  describe('Importing records', () => {
    beforeEach(() => {
      vi.spyOn(medplum, 'executeBatch').mockResolvedValue({
        resourceType: 'Bundle',
        type: 'transaction-response',
      });
    });

    test('Lists the shared records grouped by type', async () => {
      mockOperations({ match: matchResponse({ patient: LOCAL_PATIENT, grade: 'certain' }) });
      await goToRecordsStep();

      expect(screen.getByText('Select Records to Import to Existing Profile')).toBeInTheDocument();
      expect(screen.getByText('Peanuts')).toBeInTheDocument();
      expect(screen.getByText('Hemoglobin A1c')).toBeInTheDocument();
      expect(screen.getByText('2 of 2 selected')).toBeInTheDocument();
    });

    test('Imports the selected records into an existing patient', async () => {
      const onImported = vi.fn();
      const createResource = vi.spyOn(medplum, 'createResource');
      mockOperations({ match: matchResponse({ patient: LOCAL_PATIENT, grade: 'certain' }) });
      await goToRecordsStep(onImported);

      await userEvent.click(screen.getByRole('button', { name: 'Import Records to Homer J Simpson' }));

      await waitFor(() => expect(medplum.executeBatch).toHaveBeenCalledTimes(1));
      expect(createResource).not.toHaveBeenCalled();
      const transaction = vi.mocked(medplum.executeBatch).mock.calls[0][0];
      expect(transaction.type).toBe('transaction');
      // The Patient is excluded, and the records now point at the local chart. Entry order is
      // the transaction's dependency order, so compare as a set.
      expect(transaction.entry?.map((e) => e.resource?.resourceType).sort()).toEqual([
        'AllergyIntolerance',
        'Observation',
      ]);
      expect(findResource<AllergyIntolerance>(transaction, 'AllergyIntolerance').patient.reference).toBe(
        'Patient/local-patient'
      );
      expect(onImported).toHaveBeenCalledWith(LOCAL_PATIENT);
    });

    test('Creates the destination patient first when asked to', async () => {
      const created = { ...SHARED_PATIENT, id: 'created-patient' } as WithId<Patient>;
      const createResource = vi.spyOn(medplum, 'createResource').mockResolvedValue(created);
      const onImported = vi.fn();
      mockOperations({});
      await goToRecordsStep(onImported);

      expect(screen.getByText('Select Records to Import to New Profile')).toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: 'Create Homer Simpson & Import Records' }));

      await waitFor(() => expect(medplum.executeBatch).toHaveBeenCalledTimes(1));
      // The shared Patient is created fresh — the sharer's server-assigned id and metadata
      // would otherwise collide with this project's.
      const createdPatient = createResource.mock.calls[0][0] as Patient;
      expect(createdPatient.id).toBeUndefined();
      expect(createdPatient.meta).toBeUndefined();
      expect(createdPatient.name).toEqual(SHARED_PATIENT.name);
      const transaction = vi.mocked(medplum.executeBatch).mock.calls[0][0];
      expect(findResource<AllergyIntolerance>(transaction, 'AllergyIntolerance').patient.reference).toBe(
        'Patient/created-patient'
      );
      expect(onImported).toHaveBeenCalledWith(created);
    });

    test('Imports only the records left selected', async () => {
      mockOperations({ match: matchResponse({ patient: LOCAL_PATIENT, grade: 'certain' }) });
      await goToRecordsStep();

      await userEvent.click(screen.getByLabelText('Select Peanuts'));
      expect(screen.getByText('1 of 2 selected')).toBeInTheDocument();
      // Re-selecting puts it back, so a mis-click costs nothing.
      await userEvent.click(screen.getByLabelText('Select Peanuts'));
      expect(screen.getByText('2 of 2 selected')).toBeInTheDocument();
      await userEvent.click(screen.getByLabelText('Select Peanuts'));
      await userEvent.click(screen.getByRole('button', { name: 'Import Records to Homer J Simpson' }));

      await waitFor(() => expect(medplum.executeBatch).toHaveBeenCalledTimes(1));
      const transaction = vi.mocked(medplum.executeBatch).mock.calls[0][0];
      expect(transaction.entry?.map((e) => e.resource?.resourceType)).toEqual(['Observation']);
    });

    test('Clears and restores the whole selection at once', async () => {
      mockOperations({ match: matchResponse({ patient: LOCAL_PATIENT, grade: 'certain' }) });
      await goToRecordsStep();

      await userEvent.click(screen.getByLabelText('Select all resources'));
      expect(screen.getByText('0 of 2 selected')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Import Records to Homer J Simpson' })).toBeDisabled();

      await userEvent.click(screen.getByLabelText('Select all resources'));
      expect(screen.getByText('2 of 2 selected')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Import Records to Homer J Simpson' })).toBeEnabled();
    });

    test('Surfaces a failed import without leaving the step', async () => {
      mockOperations({ match: matchResponse({ patient: LOCAL_PATIENT, grade: 'certain' }) });
      vi.mocked(medplum.executeBatch).mockRejectedValue(new Error('Batch failed'));
      const onImported = vi.fn();
      await goToRecordsStep(onImported);

      await userEvent.click(screen.getByRole('button', { name: 'Import Records to Homer J Simpson' }));

      expect(await screen.findByText('Batch failed')).toBeInTheDocument();
      expect(onImported).not.toHaveBeenCalled();
      expect(screen.getByText('Select Records to Import to Existing Profile')).toBeInTheDocument();
    });

    test('Steps back to an earlier step from the stepper', async () => {
      mockOperations({ match: matchResponse({ patient: LOCAL_PATIENT, grade: 'certain' }) });
      await goToRecordsStep();

      await userEvent.click(screen.getByRole('button', { name: /Select Patient/ }));
      expect(screen.getByText('Select or Create a Patient for Records Import')).toBeInTheDocument();

      // Later steps stay locked: clicking ahead does nothing.
      await userEvent.click(screen.getByRole('button', { name: /Import Records/ }));
      expect(screen.getByText('Select or Create a Patient for Records Import')).toBeInTheDocument();
    });
  });
});

function findResource<T extends Resource>(bundle: Bundle, resourceType: T['resourceType']): T {
  const resource = bundle.entry?.find((e) => e.resource?.resourceType === resourceType)?.resource;
  if (!resource) {
    throw new Error(`Expected ${resourceType} resource`);
  }
  return resource as T;
}
