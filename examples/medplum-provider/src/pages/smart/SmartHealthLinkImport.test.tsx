// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import type { Bundle, Parameters } from '@medplum/fhirtypes';
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

const SHARED_BUNDLE: Bundle = {
  resourceType: 'Bundle',
  type: 'collection',
  entry: [
    {
      resource: {
        resourceType: 'Patient',
        id: 'shared-patient',
        name: [{ given: ['Homer'], family: 'Simpson' }],
        birthDate: '1988-01-01',
      },
    },
    {
      resource: {
        resourceType: 'AllergyIntolerance',
        id: 'shared-allergy',
        patient: { reference: 'Patient/shared-patient' },
        code: { text: 'Peanuts' },
      },
    },
  ],
};

// A resolve response for a link whose expiration has passed but whose records came back.
function expiredButAvailableResponse(): Parameters {
  return {
    resourceType: 'Parameters',
    parameter: [
      { name: 'valid', valueBoolean: true },
      { name: 'sourceOrigin', valueString: 'https://issuer.example.com' },
      { name: 'expiresAt', valueDateTime: new Date(Date.now() - 60_000).toISOString() },
      { name: 'warning', valueString: 'SMART Health Link is expired. Content was still available and decrypted.' },
      { name: 'fhirResources', valueString: JSON.stringify([SHARED_BUNDLE]) },
    ],
  };
}

const EXPIRED_SHLINK = SCANNED_CARD_QR;

describe('SmartHealthLinkImport expired links', () => {
  let medplum: MockClient;

  beforeEach(() => {
    medplum = new MockClient();
    vi.clearAllMocks();
  });

  function setup(): ReturnType<typeof render> {
    return render(
      <MemoryRouter>
        <MedplumProvider medplum={medplum}>
          <MantineProvider>
            <Notifications />
            <SmartHealthLinkImport />
          </MantineProvider>
        </MedplumProvider>
      </MemoryRouter>
    );
  }

  async function resolveExpiredLink(value: string = EXPIRED_SHLINK): Promise<void> {
    const user = userEvent.setup();
    setup();
    await user.type(screen.getByPlaceholderText(/shlink/i), value);
    await user.click(screen.getByRole('button', { name: /open smart health link/i }));
  }

  test('Advances past an expired link instead of blocking it', async () => {
    vi.spyOn(medplum, 'post').mockResolvedValue(expiredButAvailableResponse());
    await resolveExpiredLink();

    // Reaching the Select Patient step at all proves expiry no longer short-circuits.
    await waitFor(() => {
      expect(screen.getByText('Select or Create a Patient for Records Import')).toBeInTheDocument();
    });
    expect(screen.queryByText('This SMART Health Link has expired.')).not.toBeInTheDocument();
  });

  test('Shows the expiry notice below the expiration row, still inside the details section', async () => {
    vi.spyOn(medplum, 'post').mockResolvedValue(expiredButAvailableResponse());
    await resolveExpiredLink();

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
    vi.spyOn(medplum, 'post').mockResolvedValue(expiredButAvailableResponse());
    await resolveExpiredLink();

    expect(await screen.findByText(/^This link has expired/)).toBeInTheDocument();
    expect(screen.getByText('SMART Health Link Details')).toBeInTheDocument();
  });

  test('Says "card" when the input itself is a card QR payload', async () => {
    vi.spyOn(medplum, 'post').mockResolvedValue(expiredButAvailableResponse());
    await resolveExpiredLink('shc:/567629095243206034602924374044603122295953265460346029240');

    expect(await screen.findByText(/^This card has expired/)).toBeInTheDocument();
    expect(screen.getByText('SMART Health Card Details')).toBeInTheDocument();
  });

  test('Says "card" when scanned, even if the payload resolves to a plain Bundle', async () => {
    vi.spyOn(medplum, 'post').mockResolvedValue(expiredButAvailableResponse());
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
    vi.spyOn(medplum, 'post').mockImplementation(async (url: string | URL) => {
      if (String(url).includes('$verify-smart-health-card')) {
        return {
          resourceType: 'Parameters',
          parameter: [
            { name: 'valid', valueBoolean: true },
            { name: 'fhirBundle', valueString: JSON.stringify(SHARED_BUNDLE) },
          ],
        };
      }
      return {
        resourceType: 'Parameters',
        parameter: [
          { name: 'valid', valueBoolean: true },
          { name: 'sourceOrigin', valueString: 'https://issuer.example.com' },
          { name: 'expiresAt', valueDateTime: new Date(Date.now() - 60_000).toISOString() },
          { name: 'fhirResources', valueString: JSON.stringify([{ verifiableCredential: ['fake.jwt.payload'] }]) },
        ],
      };
    });
    await resolveExpiredLink();

    expect(await screen.findByText(/^This card has expired/)).toBeInTheDocument();
    expect(screen.getByText('SMART Health Card Details')).toBeInTheDocument();
  });

  test('Uses a red alert rather than yellow', async () => {
    vi.spyOn(medplum, 'post').mockResolvedValue(expiredButAvailableResponse());
    await resolveExpiredLink();

    const notice = await screen.findByText(/^This link has expired/);
    const alert = notice.closest('[class*="mantine-Alert-root"]');
    expect(alert).not.toBeNull();
    expect(alert?.getAttribute('class')).toMatch(/expiredAlert/);
    expect(getComputedStyle(alert as Element).getPropertyValue('--alert-bg')).toContain('red');
  });

  test('Does not repeat the expiry warning in the generic warning banner', async () => {
    vi.spyOn(medplum, 'post').mockResolvedValue(expiredButAvailableResponse());
    await resolveExpiredLink();

    await screen.findByText(/expired, but its records are still available/i);
    expect(screen.queryByText(/Content was still available and decrypted/i)).not.toBeInTheDocument();
  });

  test('Surfaces the server error when an expired link is no longer available', async () => {
    vi.spyOn(medplum, 'post').mockResolvedValue({
      resourceType: 'Parameters',
      parameter: [
        { name: 'valid', valueBoolean: false },
        { name: 'error', valueString: 'SMART Health Link payload request failed with HTTP 404' },
      ],
    });
    await resolveExpiredLink();

    await waitFor(() => {
      expect(screen.getByText(/failed with HTTP 404/i)).toBeInTheDocument();
    });
    expect(screen.queryByText('Select or Create a Patient for Records Import')).not.toBeInTheDocument();
  });
});
