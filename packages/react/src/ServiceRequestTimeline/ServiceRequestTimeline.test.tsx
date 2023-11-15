import { createReference, getReferenceString } from '@medplum/core';
import { Communication } from '@medplum/fhirtypes';
import { HomerServiceRequest, HomerSimpson, MockClient } from '@medplum/mock';
import { act, fireEvent, render, screen, waitFor } from '../test-utils/render';
import { randomUUID } from 'crypto';
import { MemoryRouter } from 'react-router-dom';
import { MedplumProvider } from '@medplum/react-hooks';
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
    // Create a comment
    const comment = await medplum.createResource<Communication>({
      resourceType: 'Communication',
      basedOn: [createReference(HomerServiceRequest)],
      subject: createReference(HomerSimpson),
      payload: [{ contentString: randomUUID() }],
    });

    await setup({ serviceRequest: HomerServiceRequest });

    // Wait for initial load
    await waitFor(() => screen.getByLabelText('Actions for ' + getReferenceString(comment)));

    // Click on the actions link
    await act(async () => {
      fireEvent.click(screen.getByLabelText('Actions for ' + getReferenceString(comment)));
    });

    // Click on the "Pin" menu item
    await act(async () => {
      fireEvent.click(screen.getByLabelText('Pin ' + getReferenceString(comment)));
    });

    // Click on the actions link
    await act(async () => {
      fireEvent.click(screen.getByLabelText('Actions for ' + getReferenceString(comment)));
    });

    // Click on the "Unpin" menu item
    await act(async () => {
      fireEvent.click(screen.getByLabelText('Unpin ' + getReferenceString(comment)));
    });
  });

  test('Comment details', async () => {
    // Create a comment
    const comment = await medplum.createResource<Communication>({
      resourceType: 'Communication',
      basedOn: [createReference(HomerServiceRequest)],
      subject: createReference(HomerSimpson),
      payload: [{ contentString: randomUUID() }],
    });

    await setup({ serviceRequest: HomerServiceRequest });

    // Wait for initial load
    await waitFor(() => screen.getByLabelText('Actions for ' + getReferenceString(comment)));

    // Click on the actions link
    await act(async () => {
      fireEvent.click(screen.getByLabelText('Actions for ' + getReferenceString(comment)));
    });

    // Click on the "Details" menu item
    await act(async () => {
      fireEvent.click(screen.getByLabelText('Details ' + getReferenceString(comment)));
    });
  });

  test('Edit comment', async () => {
    // Create a comment
    const comment = await medplum.createResource<Communication>({
      resourceType: 'Communication',
      basedOn: [createReference(HomerServiceRequest)],
      subject: createReference(HomerSimpson),
      payload: [{ contentString: randomUUID() }],
    });

    await setup({ serviceRequest: HomerServiceRequest });

    // Wait for initial load
    await waitFor(() => screen.getByLabelText('Actions for ' + getReferenceString(comment)));

    // Click on the actions link
    await act(async () => {
      fireEvent.click(screen.getByLabelText('Actions for ' + getReferenceString(comment)));
    });

    // Click on the "Edit" menu item
    await act(async () => {
      fireEvent.click(screen.getByLabelText('Edit ' + getReferenceString(comment)));
    });
  });

  test('Delete comment', async () => {
    // Create a comment
    const comment = await medplum.createResource<Communication>({
      resourceType: 'Communication',
      basedOn: [createReference(HomerServiceRequest)],
      subject: createReference(HomerSimpson),
      payload: [{ contentString: randomUUID() }],
    });

    await setup({ serviceRequest: HomerServiceRequest });

    // Wait for initial load
    await waitFor(() => screen.getByLabelText('Actions for ' + getReferenceString(comment)));

    // Click on the actions link
    await act(async () => {
      fireEvent.click(screen.getByLabelText('Actions for ' + getReferenceString(comment)));
    });

    // Click on the "Delete" menu item
    await act(async () => {
      fireEvent.click(screen.getByLabelText('Delete ' + getReferenceString(comment)));
    });
  });
});
