// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import type { WithId } from '@medplum/core';
import type {
  Encounter,
  Practitioner,
  Questionnaire,
  QuestionnaireResponse,
  Reference,
  Task,
} from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { TaskQuestionnaireForm } from './TaskQuestionnaireForm';

const mockQuestionnaire: Questionnaire = {
  resourceType: 'Questionnaire',
  id: 'questionnaire-123',
  status: 'active',
  title: 'Test Questionnaire',
  item: [
    {
      linkId: 'q1',
      type: 'string',
      text: 'Question 1',
    },
  ],
};

const mockQuestionnaireResponse: QuestionnaireResponse = {
  resourceType: 'QuestionnaireResponse',
  id: 'response-123',
  status: 'in-progress',
  questionnaire: 'Questionnaire/questionnaire-123',
  item: [
    {
      linkId: 'q1',
      answer: [{ valueString: 'Initial answer' }],
    },
  ],
};

const mockCompletedQuestionnaireResponse: QuestionnaireResponse = {
  ...mockQuestionnaireResponse,
  status: 'completed',
};

const mockTask: Task = {
  resourceType: 'Task',
  id: 'task-123',
  status: 'in-progress',
  intent: 'order',
  input: [
    {
      type: {
        coding: [{ code: 'Questionnaire' }],
      },
      valueReference: {
        reference: 'Questionnaire/questionnaire-123',
      } as Reference<Questionnaire>,
    },
  ],
  output: [
    {
      type: {
        coding: [{ code: 'QuestionnaireResponse' }],
      },
      valueReference: {
        reference: 'QuestionnaireResponse/response-123',
      } as Reference<QuestionnaireResponse>,
    },
  ],
};

const mockCompletedTask: Task = {
  ...mockTask,
  status: 'completed',
};

const mockTaskWithoutResponse: Task = {
  ...mockTask,
  output: undefined,
};

const mockTaskWithoutQuestionnaire: Task = {
  ...mockTask,
  input: undefined,
};

const mockEncounter: WithId<Encounter> = {
  resourceType: 'Encounter',
  id: 'encounter-123',
  status: 'in-progress',
  class: { code: 'AMB', system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode' },
};

const mockTaskWithEncounter: Task = {
  ...mockTask,
  encounter: {
    reference: 'Encounter/encounter-123',
  } as Reference<Encounter>,
};

const mockPractitioner: Practitioner = {
  resourceType: 'Practitioner',
  id: 'practitioner-123',
  name: [{ given: ['Test'], family: 'Practitioner' }],
};

describe('TaskQuestionnaireForm', () => {
  let medplum: MockClient;

  beforeEach(async () => {
    medplum = new MockClient();
    vi.clearAllMocks();

    // Set up default profile
    await medplum.createResource(mockPractitioner);
  });

  const setup = (
    task: Task,
    onChangeResponse?: (response: QuestionnaireResponse) => void
  ): ReturnType<typeof render> => {
    return render(
      <MemoryRouter>
        <MedplumProvider medplum={medplum}>
          <MantineProvider>
            <TaskQuestionnaireForm task={task} onChangeResponse={onChangeResponse} />
          </MantineProvider>
        </MedplumProvider>
      </MemoryRouter>
    );
  };

  test('fetches and displays questionnaire form when task is not completed', async () => {
    await medplum.createResource(mockQuestionnaire);
    await medplum.createResource(mockQuestionnaireResponse);

    medplum.readReference = vi.fn().mockImplementation(async (ref: Reference) => {
      if (ref.reference === 'Questionnaire/questionnaire-123') {
        return mockQuestionnaire;
      }
      if (ref.reference === 'QuestionnaireResponse/response-123') {
        return mockQuestionnaireResponse;
      }
      throw new Error('Not found');
    });

    await act(async () => {
      setup(mockTask);
    });

    await waitFor(() => {
      expect(screen.getByTestId('questionnaire-form')).toBeInTheDocument();
      expect(screen.getByText('Test Questionnaire')).toBeInTheDocument();
    });
  });

  test('displays questionnaire response when task is completed', async () => {
    await medplum.createResource(mockQuestionnaire);
    await medplum.createResource(mockCompletedQuestionnaireResponse);

    medplum.readReference = vi.fn().mockImplementation(async (ref: Reference) => {
      if (ref.reference === 'Questionnaire/questionnaire-123') {
        return mockQuestionnaire;
      }
      if (ref.reference === 'QuestionnaireResponse/response-123') {
        return mockCompletedQuestionnaireResponse;
      }
      throw new Error('Not found');
    });

    await act(async () => {
      setup(mockCompletedTask);
    });

    await waitFor(() => {
      expect(screen.getByText('Initial answer')).toBeInTheDocument();
    });

    expect(screen.queryByTestId('questionnaire-form')).not.toBeInTheDocument();
  });

  test('calls onChangeResponse when questionnaire form changes', async () => {
    const user = userEvent.setup();
    await medplum.createResource(mockQuestionnaire);
    await medplum.createResource(mockQuestionnaireResponse);

    const onChangeResponse = vi.fn();

    medplum.readReference = vi.fn().mockImplementation(async (ref: Reference) => {
      if (ref.reference === 'Questionnaire/questionnaire-123') {
        return mockQuestionnaire;
      }
      if (ref.reference === 'QuestionnaireResponse/response-123') {
        return mockQuestionnaireResponse;
      }
      throw new Error('Not found');
    });

    await act(async () => {
      setup(mockTask, onChangeResponse);
    });

    await waitFor(() => {
      expect(screen.getByTestId('questionnaire-form')).toBeInTheDocument();
    });

    const input = screen.getByLabelText('Question 1');
    await user.type(input, 'test answer');

    await waitFor(() => {
      expect(onChangeResponse).toHaveBeenCalled();
    });

    const callArgs = onChangeResponse.mock.calls[onChangeResponse.mock.calls.length - 1][0];
    expect(callArgs.resourceType).toBe('QuestionnaireResponse');
    expect(callArgs.status).toBe('in-progress');
    expect(callArgs.item).toBeDefined();
    expect(callArgs.authored).toBeDefined();
    expect(callArgs.source).toBeDefined();
  });

  test('includes encounter in onChangeResponse when task has encounter', async () => {
    const user = userEvent.setup();
    await medplum.createResource(mockQuestionnaire);
    await medplum.createResource(mockQuestionnaireResponse);
    await medplum.createResource(mockEncounter);

    const onChangeResponse = vi.fn();

    medplum.readReference = vi.fn().mockImplementation(async (ref: Reference) => {
      if (ref.reference === 'Questionnaire/questionnaire-123') {
        return mockQuestionnaire;
      }
      if (ref.reference === 'QuestionnaireResponse/response-123') {
        return mockQuestionnaireResponse;
      }
      if (ref.reference === 'Encounter/encounter-123') {
        return mockEncounter;
      }
      throw new Error('Not found');
    });

    await act(async () => {
      setup(mockTaskWithEncounter, onChangeResponse);
    });

    await waitFor(() => {
      expect(screen.getByTestId('questionnaire-form')).toBeInTheDocument();
    });

    const input = screen.getByLabelText('Question 1');
    await user.type(input, 'test answer');

    await waitFor(() => {
      expect(onChangeResponse).toHaveBeenCalled();
    });

    const callArgs = onChangeResponse.mock.calls[onChangeResponse.mock.calls.length - 1][0];
    expect(callArgs.encounter).toBeDefined();
    expect(callArgs.encounter?.reference).toBe('Encounter/encounter-123');
  });

  test('does not include encounter in onChangeResponse when task has no encounter', async () => {
    const user = userEvent.setup();
    await medplum.createResource(mockQuestionnaire);
    await medplum.createResource(mockQuestionnaireResponse);

    const onChangeResponse = vi.fn();

    medplum.readReference = vi.fn().mockImplementation(async (ref: Reference) => {
      if (ref.reference === 'Questionnaire/questionnaire-123') {
        return mockQuestionnaire;
      }
      if (ref.reference === 'QuestionnaireResponse/response-123') {
        return mockQuestionnaireResponse;
      }
      throw new Error('Not found');
    });

    await act(async () => {
      setup(mockTask, onChangeResponse);
    });

    await waitFor(() => {
      expect(screen.getByTestId('questionnaire-form')).toBeInTheDocument();
    });

    const input = screen.getByLabelText('Question 1');
    await user.type(input, 'test answer');

    await waitFor(() => {
      expect(onChangeResponse).toHaveBeenCalled();
    });

    const callArgs = onChangeResponse.mock.calls[onChangeResponse.mock.calls.length - 1][0];
    // When task has no encounter, encounter should be undefined
    expect(callArgs.encounter).toBeUndefined();
  });

  test('updates questionnaire response status to completed when task becomes completed', async () => {
    await medplum.createResource(mockQuestionnaire);
    await medplum.createResource(mockQuestionnaireResponse);

    medplum.readReference = vi.fn().mockImplementation(async (ref: Reference) => {
      if (ref.reference === 'Questionnaire/questionnaire-123') {
        return mockQuestionnaire;
      }
      if (ref.reference === 'QuestionnaireResponse/response-123') {
        return mockQuestionnaireResponse;
      }
      throw new Error('Not found');
    });

    medplum.updateResource = vi.fn().mockResolvedValue(mockCompletedQuestionnaireResponse);

    const { rerender } = setup(mockTask);

    await waitFor(() => {
      expect(screen.getByTestId('questionnaire-form')).toBeInTheDocument();
    });

    await act(async () => {
      rerender(
        <MemoryRouter>
          <MedplumProvider medplum={medplum}>
            <MantineProvider>
              <TaskQuestionnaireForm task={mockCompletedTask} />
            </MantineProvider>
          </MedplumProvider>
        </MemoryRouter>
      );
    });

    await waitFor(() => {
      expect(medplum.updateResource).toHaveBeenCalledWith(
        expect.objectContaining({
          resourceType: 'QuestionnaireResponse',
          id: 'response-123',
          status: 'completed',
        })
      );
    });
  });

  test('handles missing questionnaire response gracefully', async () => {
    await medplum.createResource(mockQuestionnaire);

    medplum.readReference = vi.fn().mockImplementation(async (ref: Reference) => {
      if (ref.reference === 'Questionnaire/questionnaire-123') {
        return mockQuestionnaire;
      }
      throw new Error('Not found');
    });

    await act(async () => {
      setup(mockTaskWithoutResponse);
    });

    await waitFor(() => {
      expect(screen.getByTestId('questionnaire-form')).toBeInTheDocument();
      expect(screen.getByText('Test Questionnaire')).toBeInTheDocument();
    });
  });

  test('handles missing questionnaire gracefully', async () => {
    await medplum.createResource(mockQuestionnaireResponse);

    medplum.readReference = vi.fn().mockImplementation(async (ref: Reference) => {
      if (ref.reference === 'QuestionnaireResponse/response-123') {
        return mockQuestionnaireResponse;
      }
      throw new Error('Not found');
    });

    await act(async () => {
      setup(mockTaskWithoutQuestionnaire);
    });

    await waitFor(() => {
      expect(screen.queryByTestId('questionnaire-form')).not.toBeInTheDocument();
      expect(screen.queryByText('Initial answer')).not.toBeInTheDocument();
    });
  });

  test('displays error when resource fetch fails', async () => {
    const error = new Error('Failed to fetch');
    medplum.readReference = vi.fn().mockRejectedValue(error);

    await act(async () => {
      setup(mockTask);
    });

    await waitFor(() => {
      expect(screen.getByText('Failed to fetch')).toBeInTheDocument();
    });
  });

  test('handles task without input or output', async () => {
    const taskWithoutInputOutput: Task = {
      ...mockTask,
      input: undefined,
      output: undefined,
    };

    await act(async () => {
      setup(taskWithoutInputOutput);
    });

    await waitFor(() => {
      expect(screen.queryByTestId('questionnaire-form')).not.toBeInTheDocument();
      expect(screen.queryByText('Initial answer')).not.toBeInTheDocument();
    });
  });

  test('creates new questionnaire response when onChange is called without existing response', async () => {
    const user = userEvent.setup();
    await medplum.createResource(mockQuestionnaire);

    const onChangeResponse = vi.fn();

    medplum.readReference = vi.fn().mockImplementation(async (ref: Reference) => {
      if (ref.reference === 'Questionnaire/questionnaire-123') {
        return mockQuestionnaire;
      }
      throw new Error('Not found');
    });

    await act(async () => {
      setup(mockTaskWithoutResponse, onChangeResponse);
    });

    await waitFor(() => {
      expect(screen.getByTestId('questionnaire-form')).toBeInTheDocument();
    });

    const input = screen.getByLabelText('Question 1');
    await user.type(input, 'test answer');

    await waitFor(() => {
      expect(onChangeResponse).toHaveBeenCalled();
    });

    const callArgs = onChangeResponse.mock.calls[onChangeResponse.mock.calls.length - 1][0];
    expect(callArgs.resourceType).toBe('QuestionnaireResponse');
    expect(callArgs.status).toBe('in-progress');
    expect(callArgs.item).toBeDefined();
  });
});
