import { createReference, generateId, getReferenceString } from '@medplum/core';
import { Communication } from '@medplum/fhirtypes';
import { HomerServiceRequest, HomerSimpson, MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import { MemoryRouter } from 'react-router-dom';
import { act, fireEvent, render, screen, waitFor } from '../test-utils/render';
import { ServiceRequestTimeline, ServiceRequestTimelineProps } from './ServiceRequestTimeline';

const medplum = new MockClient();

describe('ServiceRequestTimeline', () => {
  async function setup(args: ServiceRequestTimelineProps): Promise<void> {
    await act(async () => {
      render(
        <MemoryRouter>
          <MedplumProvider medplum={medplum} navigate={jest.fn()}>
            <ServiceRequestTimeline {...args} />
          </MedplumProvider>
        </MemoryRouter>
      );
    });
  }

  test('Renders reference', async () => {
    await setup({ serviceRequest: createReference(HomerServiceRequest) });

    await waitFor(() => screen.getAllByTestId('timeline-item'));

    const items = screen.getAllByTestId('timeline-item');
    expect(items).toBeDefined();
  });

  test('Renders resource', async () => {
    await setup({ serviceRequest: HomerServiceRequest });

    await waitFor(() => screen.getAllByTestId('timeline-item'));

    const items = screen.getAllByTestId('timeline-item');
    expect(items).toBeDefined();
  });

  test('Create comment', async () => {
    await setup({ serviceRequest: HomerServiceRequest });

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
    await setup({ serviceRequest: HomerServiceRequest });

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
    const randomText = generateId();

    // Create a comment
    const comment = await medplum.createResource<Communication>({
      resourceType: 'Communication',
      status: 'completed',
      basedOn: [createReference(HomerServiceRequest)],
      subject: createReference(HomerSimpson),
      payload: [{ contentString: randomText }],
    });

    await setup({ serviceRequest: HomerServiceRequest });

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
    const randomText = generateId();

    // Create a comment
    const comment = await medplum.createResource<Communication>({
      resourceType: 'Communication',
      status: 'completed',
      basedOn: [createReference(HomerServiceRequest)],
      subject: createReference(HomerSimpson),
      payload: [{ contentString: randomText }],
    });

    await setup({ serviceRequest: HomerServiceRequest });

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
    const randomText = generateId();

    // Create a comment
    const comment = await medplum.createResource<Communication>({
      resourceType: 'Communication',
      status: 'completed',
      basedOn: [createReference(HomerServiceRequest)],
      subject: createReference(HomerSimpson),
      payload: [{ contentString: randomText }],
    });

    await setup({ serviceRequest: HomerServiceRequest });

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

  test('Delete comment', async () => {
    const randomText = generateId();

    // Create a comment
    const comment = await medplum.createResource<Communication>({
      resourceType: 'Communication',
      status: 'completed',
      basedOn: [createReference(HomerServiceRequest)],
      subject: createReference(HomerSimpson),
      payload: [{ contentString: randomText }],
    });

    await setup({ serviceRequest: HomerServiceRequest });

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
