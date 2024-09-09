import { Notifications } from '@mantine/notifications';
import { createReference, generateId, getReferenceString } from '@medplum/core';
import { Communication, ProjectMembership } from '@medplum/fhirtypes';
import { HomerServiceRequest, HomerSimpson, MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { MemoryRouter } from 'react-router-dom';
import { AppRoutes } from '../AppRoutes';
import { act, fireEvent, render, screen, waitFor } from '../test-utils/render';

describe('TimelinePage', () => {
  async function setup(url: string, medplum = new MockClient()): Promise<void> {
    await act(async () => {
      render(
        <MedplumProvider medplum={medplum} navigate={jest.fn()}>
          <MemoryRouter initialEntries={[url]} initialIndex={0}>
            <Notifications />
            <AppRoutes />
          </MemoryRouter>
        </MedplumProvider>
      );
    });
  }

  test('Renders', async () => {
    await setup(`/${getReferenceString(HomerServiceRequest)}`);

    await waitFor(() => screen.getAllByTestId('timeline-item'));

    const items = screen.getAllByTestId('timeline-item');
    expect(items).toBeDefined();
  });

  test('Create comment', async () => {
    await setup(`/${getReferenceString(HomerServiceRequest)}`);

    // Wait for initial load
    await waitFor(() => screen.getAllByTestId('timeline-item'));

    // Enter the comment text
    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText('Add comment'), {
        target: { value: 'Test comment' },
      });
    });

    // Submit the form
    await act(async () => {
      fireEvent.submit(screen.getByTestId('timeline-form'), {
        target: { text: 'Test comment' },
      });
    });

    // Wait for new comment
    await waitFor(() => screen.getAllByTestId('timeline-item'));

    const items = screen.getAllByTestId('timeline-item');
    expect(items).toBeDefined();
  });

  test('Upload media', async () => {
    await setup(`/${getReferenceString(HomerServiceRequest)}`);

    // Wait for initial load
    await waitFor(() => screen.getAllByTestId('timeline-item'));

    // Upload the file
    await act(async () => {
      const files = [new File(['hello'], 'hello.txt', { type: 'text/plain' })];
      fireEvent.change(screen.getByTestId('upload-file-input'), {
        target: { files },
      });
    });

    // Wait for new comment
    await waitFor(() => screen.getAllByTestId('timeline-item'));

    const items = screen.getAllByTestId('timeline-item');
    expect(items).toBeDefined();
  });

  test('Pin comment', async () => {
    const medplum = new MockClient();
    const randomText = generateId();

    // Create a comment
    const comment = await medplum.createResource<Communication>({
      resourceType: 'Communication',
      status: 'completed',
      basedOn: [createReference(HomerServiceRequest)],
      subject: createReference(HomerSimpson),
      payload: [{ contentString: randomText }],
    });

    await setup(`/${getReferenceString(HomerServiceRequest)}`, medplum);

    // See if the Communication timeline item is loaded
    expect(await screen.findByText(randomText)).toBeInTheDocument();

    // Check for the Actions menu icon
    expect(screen.getByLabelText('Actions for ' + getReferenceString(comment))).toBeInTheDocument();

    // Click on the actions link
    await act(async () => {
      fireEvent.click(screen.getByLabelText('Actions for ' + getReferenceString(comment)));
    });

    // Click on the "Pin" menu item
    const pinButton = await screen.findByLabelText('Pin ' + getReferenceString(comment));
    await act(async () => {
      fireEvent.click(pinButton);
    });

    // Click on the actions link
    await act(async () => {
      fireEvent.click(screen.getByLabelText('Actions for ' + getReferenceString(comment)));
    });

    // Click on the "Unpin" menu item
    const unpinButton = await screen.findByLabelText('Unpin ' + getReferenceString(comment));
    await act(async () => {
      fireEvent.click(unpinButton);
    });
  });

  test('Comment details', async () => {
    const medplum = new MockClient();
    const randomText = generateId();

    // Create a comment
    const comment = await medplum.createResource<Communication>({
      resourceType: 'Communication',
      status: 'completed',
      basedOn: [createReference(HomerServiceRequest)],
      subject: createReference(HomerSimpson),
      payload: [{ contentString: randomText }],
    });

    await setup(`/${getReferenceString(HomerServiceRequest)}`, medplum);

    // See if the Communication timeline item is loaded
    expect(await screen.findByText(randomText)).toBeInTheDocument();

    // Check for the Actions menu icon
    expect(screen.getByLabelText('Actions for ' + getReferenceString(comment))).toBeInTheDocument();

    // Click on the actions link
    await act(async () => {
      fireEvent.click(screen.getByLabelText('Actions for ' + getReferenceString(comment)));
    });

    // Click on the "Details" menu item
    const detailsButton = await screen.findByLabelText('Details ' + getReferenceString(comment));
    await act(async () => {
      fireEvent.click(detailsButton);
    });
  });

  test('Edit comment', async () => {
    const medplum = new MockClient();
    const randomText = generateId();

    // Create a comment
    const comment = await medplum.createResource<Communication>({
      resourceType: 'Communication',
      status: 'completed',
      basedOn: [createReference(HomerServiceRequest)],
      subject: createReference(HomerSimpson),
      payload: [{ contentString: randomText }],
    });

    await setup(`/${getReferenceString(HomerServiceRequest)}`, medplum);

    // See if the Communication timeline item is loaded
    expect(await screen.findByText(randomText)).toBeInTheDocument();

    // Check for the Actions menu icon
    expect(screen.getByLabelText('Actions for ' + getReferenceString(comment))).toBeInTheDocument();

    // Click on the actions link
    await act(async () => {
      fireEvent.click(screen.getByLabelText('Actions for ' + getReferenceString(comment)));
    });

    // Click on the "Edit" menu item
    const editButton = await screen.findByLabelText('Edit ' + getReferenceString(comment));
    await act(async () => {
      fireEvent.click(editButton);
    });
  });

  test('Resend subscriptions', async () => {
    const medplum = new MockClient();
    const randomText = generateId();

    // Mock project membership to return admin = true
    medplum.getProjectMembership = () => ({ admin: true }) as ProjectMembership;

    // Create a comment
    const comment = await medplum.createResource<Communication>({
      resourceType: 'Communication',
      status: 'completed',
      basedOn: [createReference(HomerServiceRequest)],
      subject: createReference(HomerSimpson),
      payload: [{ contentString: randomText }],
    });

    await setup(`/${getReferenceString(HomerServiceRequest)}`, medplum);

    // See if the Communication timeline item is loaded
    expect(await screen.findByText(randomText)).toBeInTheDocument();

    // Check for the Actions menu icon
    expect(screen.getByLabelText('Actions for ' + getReferenceString(comment))).toBeInTheDocument();

    // Click on the actions link
    await act(async () => {
      fireEvent.click(screen.getByLabelText('Actions for ' + getReferenceString(comment)));
    });

    // Click on the "Resend Subscriptions" menu item
    const resendButton = await screen.findByLabelText('Resend Subscriptions ' + getReferenceString(comment));
    await act(async () => {
      fireEvent.click(resendButton);
    });

    // Now there should be a "Resend" modal and button
    expect(await screen.findByText('Resend Subscriptions')).toBeInTheDocument();
    expect(await screen.findByText('Resend')).toBeInTheDocument();
  });

  test('Delete comment', async () => {
    const medplum = new MockClient();
    const randomText = generateId();

    // Create a comment
    const comment = await medplum.createResource<Communication>({
      resourceType: 'Communication',
      status: 'completed',
      basedOn: [createReference(HomerServiceRequest)],
      subject: createReference(HomerSimpson),
      payload: [{ contentString: randomText }],
    });

    await setup(`/${getReferenceString(HomerServiceRequest)}`, medplum);

    // See if the Communication timeline item is loaded
    expect(await screen.findByText(randomText)).toBeInTheDocument();

    // Check for the Actions menu icon
    expect(screen.getByLabelText('Actions for ' + getReferenceString(comment))).toBeInTheDocument();

    // Click on the actions link
    await act(async () => {
      fireEvent.click(screen.getByLabelText('Actions for ' + getReferenceString(comment)));
    });

    // Click on the "Delete" menu item
    const deleteButton = await screen.findByLabelText('Delete ' + getReferenceString(comment));
    await act(async () => {
      fireEvent.click(deleteButton);
    });
  });
});
