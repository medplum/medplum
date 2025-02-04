import { ExampleWorkflowPlanDefinition, MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import { MemoryRouter } from 'react-router-dom';
import { act, fireEvent, render, screen, userEvent } from '../test-utils/render';
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

    expect(screen.findByDisplayValue('Example Plan Definition')).toBeDefined();
    expect(screen.findByDisplayValue('Patient Registration')).toBeDefined();
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
      fireEvent.mouseOver(await screen.findByDisplayValue('Example Action'));
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

    expect(onSubmit).toHaveBeenCalled();
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

    expect(await screen.findByDisplayValue('Example Plan Definition')).toBeInTheDocument();

    await act(async () => {
      fireEvent.change(screen.getByDisplayValue('Example Plan Definition'), {
        target: { value: 'Renamed Plan Definition' },
      });
    });

    expect(screen.getByText('Save')).toBeDefined();

    await act(async () => {
      fireEvent.click(screen.getByText('Save'));
    });

    expect(onSubmit).toHaveBeenCalled();
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

    expect(await screen.findByDisplayValue('Example Action')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(await screen.findByDisplayValue('Example Action'));
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

    expect(onSubmit).toHaveBeenCalled();
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

    expect(await screen.findByText('Add action')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByText('Add action'));
    });

    expect(await screen.getByPlaceholderText('Title')).toBeInTheDocument();

    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText('Title'), {
        target: { value: 'Example Questionnaire Action' },
      });
    });

    const questionnaireRadio = screen.getByLabelText('Task with Questionnaire');
    expect(questionnaireRadio).not.toBeChecked();
    const user = userEvent.setup();
    await user.click(questionnaireRadio);

    expect(screen.getByText('Save')).toBeDefined();

    await act(async () => {
      fireEvent.click(screen.getByText('Save'));
    });

    expect(onSubmit).toHaveBeenCalled();
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

    expect(await screen.findByText('Add action')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByText('Add action'));
    });

    expect(await screen.getByPlaceholderText('Title')).toBeInTheDocument();

    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText('Title'), {
        target: { value: 'Example Task Action' },
      });
    });

    const questionnaireRadio = screen.getByLabelText('Standard task');
    expect(questionnaireRadio).toBeChecked();

    expect(screen.getByText('Save')).toBeDefined();

    await act(async () => {
      fireEvent.click(screen.getByText('Save'));
    });

    expect(onSubmit).toHaveBeenCalled();
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

    expect(await screen.getByTestId('close-button')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByTestId('close-button'));
    });

    expect(screen.getByText('Save')).toBeDefined();

    await act(async () => {
      fireEvent.click(screen.getByText('Save'));
    });

    expect(onSubmit).toHaveBeenCalled();
  });
});
