// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import type { MedicationOrderExtensions } from '@medplum/core';
import type { MedicationRequest } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { MedicationRequestDetails } from './MedicationRequestDetails';

const extensions: MedicationOrderExtensions = {
  pendingOrderIdSystem: 'https://scriptsure.com/pending-order-id',
  pendingOrderStatusUrl: 'https://scriptsure.com/pending-order-status',
  iframeUrlExtension: 'https://scriptsure.com/iframe-url',
};

describe('MedicationRequestDetails', () => {
  test('keeps an on-hold transmission status reason visible', () => {
    const medplum = new MockClient();
    const medicationRequest: MedicationRequest = {
      resourceType: 'MedicationRequest',
      id: 'rx-1',
      status: 'on-hold',
      statusReason: {
        coding: [
          {
            system: 'https://scriptsure.com/medication-request-status-reason',
            code: 'transmission-error',
            display: 'Prescription transmission error',
          },
        ],
        text: '601 Receiver Unable To Process',
      },
      intent: 'order',
      medicationCodeableConcept: { text: 'Alinia 500 mg tablet' },
      subject: { reference: 'Patient/patient-1' },
    };

    render(
      <MemoryRouter>
        <MedplumProvider medplum={medplum}>
          <MantineProvider>
            <MedicationRequestDetails
              medicationRequest={medicationRequest}
              medicationOrderExtensions={extensions}
              onOpenInScriptSure={() => undefined}
            />
          </MantineProvider>
        </MedplumProvider>
      </MemoryRouter>
    );

    expect(screen.getByText('Status reason')).toBeInTheDocument();
    expect(screen.getByText('601 Receiver Unable To Process')).toBeInTheDocument();
  });
});
