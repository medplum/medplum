// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Communication } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { act, fireEvent, renderAppRoutes, screen } from '../test-utils/render';

describe('CommunicationPayloadPage', () => {
  async function setup(url: string, medplum = new MockClient()): Promise<MockClient> {
    await act(async () => {
      renderAppRoutes(medplum, url);
    });
    return medplum;
  }

  test('renders textareas for contentString payload items', async () => {
    const medplum = new MockClient();
    const communication = await medplum.createResource<Communication>({
      resourceType: 'Communication',
      status: 'completed',
      payload: [{ contentString: 'Hello world' }, { contentString: 'Second message' }],
    });

    await setup(`/Communication/${communication.id}/payload`, medplum);

    const textareas = await screen.findAllByPlaceholderText('Enter content...');
    expect(textareas).toHaveLength(2);
    expect(textareas[0]).toHaveValue('Hello world');
    expect(textareas[1]).toHaveValue('Second message');
  });

  test('filters out non-contentString payload items', async () => {
    const medplum = new MockClient();
    const communication = await medplum.createResource<Communication>({
      resourceType: 'Communication',
      status: 'completed',
      payload: [
        { contentString: 'Keep me' },
        { contentAttachment: { url: 'https://example.com/file.pdf' } },
        { contentReference: { reference: 'DocumentReference/123' } },
      ],
    });

    await setup(`/Communication/${communication.id}/payload`, medplum);

    const textareas = await screen.findAllByPlaceholderText('Enter content...');
    expect(textareas).toHaveLength(1);
    expect(textareas[0]).toHaveValue('Keep me');
  });

  test('renders empty state with no textareas when payload is absent', async () => {
    const medplum = new MockClient();
    const communication = await medplum.createResource<Communication>({
      resourceType: 'Communication',
      status: 'completed',
    });

    await setup(`/Communication/${communication.id}/payload`, medplum);

    expect(await screen.findByRole('button', { name: 'Save' })).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Enter content...')).not.toBeInTheDocument();
  });

  test('edits a textarea value', async () => {
    const medplum = new MockClient();
    const communication = await medplum.createResource<Communication>({
      resourceType: 'Communication',
      status: 'completed',
      payload: [{ contentString: 'Original' }],
    });

    await setup(`/Communication/${communication.id}/payload`, medplum);

    const textarea = await screen.findByPlaceholderText('Enter content...');
    await act(async () => {
      fireEvent.change(textarea, { target: { value: 'Updated' } });
    });

    expect(textarea).toHaveValue('Updated');
  });

  test('saves updated payload and shows success notification', async () => {
    const medplum = new MockClient();
    const communication = await medplum.createResource<Communication>({
      resourceType: 'Communication',
      status: 'completed',
      payload: [{ contentString: 'Original' }],
    });

    await setup(`/Communication/${communication.id}/payload`, medplum);

    const textarea = await screen.findByPlaceholderText('Enter content...');
    await act(async () => {
      fireEvent.change(textarea, { target: { value: 'Updated' } });
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    });

    expect(await screen.findByText('Saved')).toBeInTheDocument();

    const updated = await medplum.readResource('Communication', communication.id);
    expect(updated.payload?.[0].contentString).toBe('Updated');
  });

  test('preserves attachment and reference payloads when saving string edits', async () => {
    const medplum = new MockClient();
    const communication = await medplum.createResource<Communication>({
      resourceType: 'Communication',
      status: 'completed',
      payload: [
        { contentString: 'Original text' },
        { contentAttachment: { url: 'https://example.com/file.pdf', title: 'My PDF' } },
        { contentReference: { reference: 'DocumentReference/123' } },
      ],
    });

    await setup(`/Communication/${communication.id}/payload`, medplum);

    const textarea = await screen.findByPlaceholderText('Enter content...');
    await act(async () => {
      fireEvent.change(textarea, { target: { value: 'Updated text' } });
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    });

    expect(await screen.findAllByText('Saved')).not.toHaveLength(0);

    const updated = await medplum.readResource('Communication', communication.id);
    expect(updated.payload).toHaveLength(3);
    expect(updated.payload?.[0].contentString).toBe('Updated text');
    expect(updated.payload?.[1].contentAttachment).toEqual({ url: 'https://example.com/file.pdf', title: 'My PDF' });
    expect(updated.payload?.[2].contentReference).toEqual({ reference: 'DocumentReference/123' });
  });

  test('adds a new text payload when no payload is available', async () => {
    const medplum = new MockClient();
    const communication = await medplum.createResource<Communication>({
      resourceType: 'Communication',
      status: 'completed',
    });

    await setup(`/Communication/${communication.id}/payload`, medplum);

    await act(async () => {
      fireEvent.click(await screen.findByRole('button', { name: 'Add payload' }));
    });

    const textarea = screen.getByPlaceholderText('Enter content...');
    expect(textarea).toBeInTheDocument();

    await act(async () => {
      fireEvent.change(textarea, { target: { value: 'New message' } });
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    });

    expect(await screen.findAllByText('Saved')).not.toHaveLength(0);

    const updated = await medplum.readResource('Communication', communication.id);
    expect(updated.payload?.[0].contentString).toBe('New message');
  });
});
