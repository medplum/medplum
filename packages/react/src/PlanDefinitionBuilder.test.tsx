import { ExampleWorkflowPlanDefinition, MockClient } from '@medplum/mock';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { MedplumProvider } from './MedplumProvider';
import { PlanDefinitionBuilder, PlanDefinitionBuilderProps } from './PlanDefinitionBuilder';

const medplum = new MockClient();

async function setup(args: PlanDefinitionBuilderProps): Promise<void> {
  await act(async () => {
    render(
      <MedplumProvider medplum={medplum}>
        <PlanDefinitionBuilder {...args} />
      </MedplumProvider>
    );
  });
}

describe('PlanDefinitionBuilder', () => {
  test('Renders empty', async () => {
    await setup({
      value: {
        resourceType: 'PlanDefinition',
      },
      onSubmit: jest.fn(),
    });
    expect(screen.getByTestId('questionnaire-form')).toBeDefined();
  });

  test('Render existing', async () => {
    await setup({
      value: ExampleWorkflowPlanDefinition,
      onSubmit: jest.fn(),
    });

    expect(screen.getByText('Patient Registration')).toBeDefined();
    expect(screen.getByText('Family Health History')).toBeDefined();
  });

  test('Handles submit', async () => {
    const onSubmit = jest.fn();

    await setup({
      value: ExampleWorkflowPlanDefinition,
      onSubmit,
    });

    expect(screen.getByText('Save')).toBeDefined();

    await act(async () => {
      fireEvent.click(screen.getByText('Save'));
    });

    expect(onSubmit).toBeCalled();
  });

  test('Change title', async () => {
    const onSubmit = jest.fn();

    await setup({
      value: {
        resourceType: 'PlanDefinition',
        title: 'Example Plan Definition',
      },
      onSubmit,
    });

    await waitFor(() => screen.getByDisplayValue('Example Plan Definition'));

    await act(async () => {
      fireEvent.change(screen.getByDisplayValue('Example Plan Definition'), {
        target: { value: 'Renamed Plan Definition' },
      });
    });

    expect(screen.getByText('Save')).toBeDefined();

    await act(async () => {
      fireEvent.click(screen.getByText('Save'));
    });

    expect(onSubmit).toBeCalled();
  });

  test('Add lab action', async () => {
    const onSubmit = jest.fn();

    await setup({
      value: {
        resourceType: 'PlanDefinition',
        title: 'Example Plan Definition',
      },
      onSubmit,
    });

    await waitFor(() => screen.getByText('Add action'));

    await act(async () => {
      fireEvent.click(screen.getByText('Add action'));
    });

    await waitFor(() => screen.getByLabelText('Action Title'));

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Action Title'), {
        target: { value: 'Example Lab Action' },
      });
    });

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Action Type'), {
        target: { value: 'lab' },
      });
    });

    expect(screen.getByText('Save')).toBeDefined();

    await act(async () => {
      fireEvent.click(screen.getByText('Save'));
    });

    expect(onSubmit).toBeCalled();
  });

  test('Add questionnaire action', async () => {
    const onSubmit = jest.fn();

    await setup({
      value: {
        resourceType: 'PlanDefinition',
        title: 'Example Plan Definition',
      },
      onSubmit,
    });

    await waitFor(() => screen.getByText('Add action'));

    await act(async () => {
      fireEvent.click(screen.getByText('Add action'));
    });

    await waitFor(() => screen.getByLabelText('Action Title'));

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Action Title'), {
        target: { value: 'Example Questionnaire Action' },
      });
    });

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Action Type'), {
        target: { value: 'questionnaire' },
      });
    });

    expect(screen.getByText('Save')).toBeDefined();

    await act(async () => {
      fireEvent.click(screen.getByText('Save'));
    });

    expect(onSubmit).toBeCalled();
  });

  test('Remove action', async () => {
    const onSubmit = jest.fn();

    await setup({
      value: {
        resourceType: 'PlanDefinition',
        title: 'Example Plan Definition',
        action: [
          {
            id: 'id-1',
            title: 'Patient Registration',
          },
        ],
      },
      onSubmit,
    });

    await waitFor(() => screen.getByText('Remove'));

    await act(async () => {
      fireEvent.click(screen.getByText('Remove'));
    });

    expect(screen.getByText('Save')).toBeDefined();

    await act(async () => {
      fireEvent.click(screen.getByText('Save'));
    });

    expect(onSubmit).toBeCalled();
  });
});
