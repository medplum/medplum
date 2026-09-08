// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { Notifications, notifications } from '@mantine/notifications';
import type { SearchRequest } from '@medplum/core';
import { allOk, notFound, OperationOutcomeError } from '@medplum/core';
import type { Communication } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { FaxBoard } from './FaxBoard';

const INBOX_QUERY = 'medium=FAXWRIT&_sort=-sent';

// An inbound fax. Without `medium` it does not match the board's search, standing in for a fax
// that is not on the current page.
function inboundFax(id: string, sender: string, options?: { inList?: boolean }): Communication {
  return {
    resourceType: 'Communication',
    id,
    status: 'completed',
    sent: '2026-03-04T15:30:00Z',
    sender: { display: sender },
    topic: { text: `Referral from ${sender}` },
    medium:
      options?.inList === false
        ? undefined
        : [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v3-ParticipationMode', code: 'FAXWRIT' }] }],
  };
}

describe('FaxBoard', () => {
  let medplum: MockClient;
  let onNew: (fax: Communication) => void;
  let onChange: (search: SearchRequest) => void;

  beforeEach(() => {
    medplum = new MockClient();
    onNew = vi.fn();
    onChange = vi.fn();
    vi.clearAllMocks();
    notifications.clean();
    notifications.cleanQueue();
  });

  // Stubs the eFax operations — the `$receive-efax` poll the board fires on mount and the
  // `$send-efax` send — leaving the searches and creates ResourceBoard runs against MockClient.
  function mockEfax(receiveResult: Error | 'ok'): ReturnType<typeof vi.spyOn> {
    const post = medplum.post.bind(medplum);
    return vi.spyOn(medplum, 'post').mockImplementation(async (url, ...rest) => {
      const path = String(url);
      if (path.includes('$receive-efax')) {
        if (receiveResult instanceof Error) {
          throw receiveResult;
        }
        return allOk;
      }
      if (path.includes('$send-efax')) {
        return allOk;
      }
      return post(url, ...(rest as []));
    }) as ReturnType<typeof vi.spyOn>;
  }

  function setup(props: { faxId?: string; activeTab?: 'inbox' | 'sent' } = {}): ReturnType<typeof render> {
    return render(
      <MemoryRouter>
        <MedplumProvider medplum={medplum}>
          <MantineProvider>
            <Notifications />
            <FaxBoard
              faxId={props.faxId}
              activeTab={props.activeTab ?? 'inbox'}
              inboxUri="/fax/inbox"
              sentUri="/fax/sent"
              query={INBOX_QUERY}
              getFaxUri={(fax) => `/fax/inbox/${fax.id}`}
              onNew={onNew}
              onChange={onChange}
            />
          </MantineProvider>
        </MedplumProvider>
      </MemoryRouter>
    );
  }

  test('Polls for new faxes once on mount', async () => {
    const post = mockEfax('ok');
    setup();

    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(String(post.mock.calls[0][0])).toContain('$receive-efax');
  });

  test('Stays quiet when the eFax integration is not deployed', async () => {
    // A project with no eFax vendor gets a 404 from the operation — expected, not an error.
    const post = mockEfax(new OperationOutcomeError(notFound));
    setup();

    await waitFor(() => expect(post).toHaveBeenCalled());
    expect(screen.queryByText('Error')).not.toBeInTheDocument();
  });

  test('Reports a failed poll', async () => {
    mockEfax(new Error('eFax vendor unreachable'));
    setup();

    expect(await screen.findByText('eFax vendor unreachable')).toBeInTheDocument();
  });

  test('Lists the faxes it finds under both tabs', async () => {
    mockEfax('ok');
    await medplum.createResource(inboundFax('fax-1', 'Springfield Clinic'));
    setup();

    expect(await screen.findByText('Springfield Clinic')).toBeInTheDocument();
    expect(screen.getByText('Received')).toBeInTheDocument();
    expect(screen.getByText('Sent')).toBeInTheDocument();
  });

  test('Prompts for a selection when nothing is selected', async () => {
    mockEfax('ok');
    setup();

    expect(await screen.findByText('No fax selected')).toBeInTheDocument();
  });

  test('Shows the selected fax, even one outside the current list', async () => {
    mockEfax('ok');
    await medplum.createResource(inboundFax('fax-other', 'Shelbyville Clinic', { inList: false }));
    setup({ faxId: 'fax-other' });

    // It is read directly rather than taken from the list, which does not contain it.
    expect(await screen.findByText('Shelbyville Clinic')).toBeInTheDocument();
    expect(screen.getByText('No document attached to this fax')).toBeInTheDocument();
    expect(screen.getByText('No faxes in your inbox.')).toBeInTheDocument();
  });

  test('Opens the selected fax that is in the list', async () => {
    mockEfax('ok');
    await medplum.createResource(inboundFax('fax-1', 'Springfield Clinic'));
    setup({ faxId: 'fax-1' });

    // Once in the list, once as the detail heading.
    await waitFor(() => expect(screen.getAllByText('Springfield Clinic')).toHaveLength(2));
  });

  test('Ignores a stale selected fax id without toasting', async () => {
    mockEfax('ok');
    setup({ faxId: 'deleted-fax' });

    expect(await screen.findByText('No fax selected')).toBeInTheDocument();
    expect(screen.queryByText('Error')).not.toBeInTheDocument();
  });

  test('Opens the send fax modal from the header action', async () => {
    mockEfax('ok');
    setup();

    await waitFor(() => expect(document.querySelector('.tabler-icon-send')).not.toBeNull());
    await userEvent.click(document.querySelector('.tabler-icon-send')?.closest('button') as HTMLElement);

    expect(await screen.findByLabelText(/Fax Number/)).toBeInTheDocument();
  });

  test('Hands a fax sent from the board back to the page', async () => {
    mockEfax('ok');
    vi.spyOn(medplum, 'createAttachment').mockResolvedValue({
      contentType: 'application/pdf',
      url: 'http://example.com/binary/fax.pdf',
    });
    setup();

    await waitFor(() => expect(document.querySelector('.tabler-icon-send')).not.toBeNull());
    await userEvent.click(document.querySelector('.tabler-icon-send')?.closest('button') as HTMLElement);

    const faxNumberInput = await screen.findByLabelText(/Fax Number/);
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, {
      target: { files: [new File(['%PDF-1.7'], 'referral.pdf', { type: 'application/pdf' })] },
    });
    await userEvent.type(faxNumberInput, '5551234567');
    await userEvent.click(screen.getByRole('button', { name: 'Send Fax' }));

    await waitFor(() => expect(onNew).toHaveBeenCalledTimes(1));
    expect(vi.mocked(onNew).mock.calls[0][0].resourceType).toBe('Communication');
  });

  test('Reports an empty inbox', async () => {
    mockEfax('ok');
    setup();

    expect(await screen.findByText('No faxes in your inbox.')).toBeInTheDocument();
  });

  test('Reports an empty sent folder', async () => {
    mockEfax('ok');
    setup({ activeTab: 'sent' });

    expect(await screen.findByText('No sent faxes.')).toBeInTheDocument();
  });
});
