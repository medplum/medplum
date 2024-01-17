import { ExampleWorkflowPlanDefinition, MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import { MemoryRouter } from 'react-router-dom';
import { act, fireEvent, render, screen, waitFor } from '../test-utils/render';
import { PlanDefinitionBuilder, PlanDefinitionBuilderProps } from './PlanDefinitionBuilder';

const medplum = new MockClient();

async function setup(args: PlanDefinitionBuilderProps): Promise<void> {
  await act(async () => {
    render(
      <MemoryRouter>
        <MedplumProvider medplum={medplum}>
          <PlanDefinitionBuilder {...args} />
        </MedplumProvider>
      </MemoryRouter>
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

    expect(screen.getByText('Patient Registration (questionnaire)')).toBeDefined();
    expect(screen.getByText('Family Health History (questionnaire)')).toBeDefined();
  });

  test('Hover on/off', async () => {
    await setup({
      value: {
        resourceType: 'PlanDefinition',
        action: [
          {
            id: 'action1',
            title: 'Example Action',
          },
        ],
      },
      onSubmit: jest.fn(),
    });

    expect(screen.getByTestId('action1')).not.toHaveClass('hovering');

    await act(async () => {
      fireEvent.mouseOver(screen.getByText('Example Action'));
    });

    expect(screen.getByTestId('action1')).toHaveClass('hovering');

    await act(async () => {
      fireEvent.mouseOver(document.body);
    });

    expect(screen.getByTestId('action1')).not.toHaveClass('hovering');
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

  test('Change plan title', async () => {
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

  test('Change action title', async () => {
    const onSubmit = jest.fn();

    await setup({
      value: {
        resourceType: 'PlanDefinition',
        title: 'Example Plan Definition',
        action: [
          {
            title: 'Example Action',
          },
        ],
      },
      onSubmit,
    });

    await waitFor(() => screen.getByText('Example Action'));

    await act(async () => {
      fireEvent.click(screen.getByText('Example Action'));
    });

    await act(async () => {
      fireEvent.change(screen.getByDisplayValue('Example Action'), {
        target: { value: 'Renamed Action' },
      });
    });

    expect(screen.getByText('Save')).toBeDefined();

    await act(async () => {
      fireEvent.click(screen.getByText('Save'));
    });

    expect(onSubmit).toBeCalled();
  });

  test('Add appointment action', async () => {
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

    await waitFor(() => screen.getByLabelText('Title'));

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Title'), {
        target: { value: 'Example Lab Action' },
      });
    });

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Type of Action'), {
        target: { value: 'appointment' },
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

    await waitFor(() => screen.getByLabelText('Title'));

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Title'), {
        target: { value: 'Example Lab Action' },
      });
    });

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Type of Action'), {
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

    await waitFor(() => screen.getByLabelText('Title'));

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Title'), {
        target: { value: 'Example Questionnaire Action' },
      });
    });

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Type of Action'), {
        target: { value: 'questionnaire' },
      });
    });

    expect(screen.getByText('Save')).toBeDefined();

    await act(async () => {
      fireEvent.click(screen.getByText('Save'));
    });

    expect(onSubmit).toBeCalled();
  });

  test('Add task action', async () => {
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

    await waitFor(() => screen.getByLabelText('Title'));

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Title'), {
        target: { value: 'Example Task Action' },
      });
    });

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Type of Action'), {
        target: { value: 'task' },
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
