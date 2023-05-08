import { getReferenceString } from '@medplum/core';
import { AuditEvent, Bot } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { AppRoutes } from '../AppRoutes';

const medplum = new MockClient();

describe('AuditEventPage', () => {
  function setup(url: string): void {
    render(
      <MedplumProvider medplum={medplum}>
        <MemoryRouter initialEntries={[url]} initialIndex={0}>
          <AppRoutes />
        </MemoryRouter>
      </MedplumProvider>
    );
  }

  test('Renders', async () => {
    const bot = await medplum.createResource<Bot>({
      resourceType: 'Bot',
    });

    const auditEvent = await medplum.createResource<AuditEvent>({
      resourceType: 'AuditEvent',
      entity: [
        {
          what: {
            reference: getReferenceString(bot),
          },
        },
      ],
    });

    // load bot page
    await act(async () => {
      setup(`/${getReferenceString(bot)}`);
    });

    const eventTab = screen.getByRole('tab', { name: 'Event' });

    // click on Event tab
    await act(async () => {
      fireEvent.click(eventTab);
    });

    expect(screen.getByText(`${auditEvent.id}`)).toBeInTheDocument();

    // click on a audit event
    await act(async () => {
      fireEvent.click(screen.getByText(`${auditEvent.id}`));
    });

    expect(screen.getByLabelText(`Actions for AuditEvent/${auditEvent.id}`));
  });

  test('Renders test changes', async () => {
    const bot = await medplum.createResource<Bot>({
      resourceType: 'Bot',
    });

    const auditEvent = await medplum.createResource<AuditEvent>({
      resourceType: 'AuditEvent',
      entity: [
        {
          what: {
            reference: getReferenceString(bot),
          },
        },
      ],
    });

    // directly load bot audit event page
    await act(async () => {
      setup(`/${getReferenceString(bot)}/event`);
    });

    // click on a audit event
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Last Updated' }));
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('menuitem', { name: 'Sort Newest to Oldest' }));
    });

    expect(screen.getByText(`${auditEvent.id}`)).toBeInTheDocument();
  });
});
