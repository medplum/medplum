// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { ActivityDefinition } from '@medplum/fhirtypes';
import { ExampleWorkflowPlanDefinition, MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import { MemoryRouter } from 'react-router';
import { act, fireEvent, render, screen } from '../test-utils/render';
import type { PlanDefinitionBuilderProps } from './PlanDefinitionBuilder';
import { PlanDefinitionBuilder } from './PlanDefinitionBuilder';

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
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(async () => {
    await act(async () => {
      jest.runOnlyPendingTimers();
    });
    jest.useRealTimers();
  });

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

    expect(await screen.findByDisplayValue('Example Plan Definition')).toBeDefined();
    expect(await screen.findByDisplayValue('Patient Registration')).toBeDefined();
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

    fireEvent.mouseOver(await screen.findByDisplayValue('Example Action'));

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

    fireEvent.click(await screen.findByDisplayValue('Example Action'));

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

  test('Add activity definition action', async () => {
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

    expect(screen.getByPlaceholderText('Title')).toBeInTheDocument();

    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText('Title'), {
        target: { value: 'Example Activity Definition Action' },
      });
    });

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Type of Action'), {
        target: { value: 'activitydefinition' },
      });
    });

    expect(await screen.findByText('Select activity definition')).toBeInTheDocument();

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

    expect(screen.getByPlaceholderText('Title')).toBeInTheDocument();

    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText('Title'), {
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

    expect(screen.getByPlaceholderText('Title')).toBeInTheDocument();

    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText('Title'), {
        target: { value: 'Example Task Action' },
      });
    });

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Type of Action'), {
        target: { value: 'standard' },
      });
    });

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

    expect(screen.getByTestId('close-button')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByTestId('close-button'));
    });

    expect(screen.getByText('Save')).toBeDefined();

    await act(async () => {
      fireEvent.click(screen.getByText('Save'));
    });

    expect(onSubmit).toHaveBeenCalled();
  });

  test('Validate activity definition action', async () => {
    const onSubmit = jest.fn();

    await medplum.createResource<ActivityDefinition>({
      resourceType: 'ActivityDefinition',
      id: '01981529-94c2-7119-af3c-4af84ec3c74b',
      name: 'Comprehensive Metabolic Panel',
      status: 'active',
      url: 'https://example.com/ActivityDefinition/01981529-94c2-7119-af3c-4af84ec3c74b',
    });

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

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Type of Action'), {
        target: { value: 'activitydefinition' },
      });
    });

    expect(await screen.findByText('Select activity definition')).toBeInTheDocument();

    const input = screen.getByPlaceholderText('Search for activity definition') as HTMLInputElement;

    await act(async () => {
      fireEvent.change(input, { target: { value: 'Comprehensive' } });
    });

    // Wait for the drop down
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });

    expect(screen.getByText('Comprehensive Metabolic Panel')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByText('Comprehensive Metabolic Panel'));
    });

    expect(screen.getByText('Save')).toBeDefined();

    await act(async () => {
      fireEvent.click(screen.getByText('Save'));
    });

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: [
          {
            definitionCanonical: 'https://example.com/ActivityDefinition/01981529-94c2-7119-af3c-4af84ec3c74b',
            definitionUri: undefined,
            id: 'id-11',
          },
        ],
        resourceType: 'PlanDefinition',
        title: 'Example Plan Definition',
      })
    );
  });
});
