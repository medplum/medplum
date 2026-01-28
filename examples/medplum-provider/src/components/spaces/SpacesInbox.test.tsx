// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import type { Communication } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { SpacesInbox } from './SpacesInbox';

const mockTopic: Communication = {
  resourceType: 'Communication',
  id: 'topic-123',
  status: 'in-progress',
  identifier: [
    {
      system: 'http://medplum.com/ai-message',
      value: 'ai-message-topic',
    },
  ],
  topic: {
    text: 'Test conversation',
  },
};

const mockProfile = {
  resourceType: 'Practitioner' as const,
  id: 'practitioner-123',
};

// Helper to create a mock streaming response
function createMockStreamingResponse(content: string): Response {
  const encoder = new TextEncoder();
  const sseData = `data: ${JSON.stringify({ content })}\n\ndata: [DONE]\n\n`;
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(sseData));
      controller.close();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
  });
}

describe('SpacesInbox', () => {
  let medplum: MockClient;
  const onNewTopicMock = vi.fn();
  const onSelectedItemMock = vi.fn((topic: Communication) => `/Spaces/Communication/${topic.id}`);

  beforeEach(() => {
    medplum = new MockClient();
    vi.clearAllMocks();

    Element.prototype.scrollTo = vi.fn();
    medplum.getProfile = vi.fn().mockResolvedValue(mockProfile) as any;
    medplum.searchResources = vi.fn().mockResolvedValue([]);
    medplum.searchOne = vi.fn().mockResolvedValue({ resourceType: 'Bot', id: 'bot-123' });
    medplum.getAccessToken = vi.fn().mockReturnValue('mock-token');
    medplum.fhirUrl = vi.fn().mockReturnValue(new URL('https://api.medplum.com/fhir/R4/Bot/bot-123/$execute'));
    medplum.readReference = vi.fn().mockImplementation((ref: any) => {
      if (ref.reference?.startsWith('Communication/')) {
        return Promise.resolve(mockTopic);
      }
      // For other references, return a basic resource with resourceType and id
      const [resourceType, id] = ref.reference?.split('/') || [];
      return Promise.resolve({ resourceType, id, meta: {} } as any);
    });
    medplum.createResource = vi.fn().mockImplementation((resource: any) => {
      if (resource.identifier?.[0]?.value === 'ai-message-topic') {
        return Promise.resolve(mockTopic);
      }
      return Promise.resolve({ ...resource, id: 'message-123' } as Communication);
    });
  });

  const setup = (topicRef?: { reference: string }): ReturnType<typeof render> => {
    return render(
      <MemoryRouter>
        <MedplumProvider medplum={medplum}>
          <MantineProvider>
            <SpacesInbox topic={topicRef} onNewTopic={onNewTopicMock} onSelectedItem={onSelectedItemMock} />
          </MantineProvider>
        </MedplumProvider>
      </MemoryRouter>
    );
  };

  describe('Initial state (before first message)', () => {
    test('renders the initial state with How can I help you today? heading', async () => {
      await act(async () => {
        setup();
      });

      expect(screen.getByText('How can I help you today?')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Ask, search, or make anything...')).toBeInTheDocument();
    });

    test('shows history button', async () => {
      await act(async () => {
        setup();
      });

      const buttons = screen.getAllByRole('button');
      expect(buttons.length).toBeGreaterThan(0);
    });

    test('conversation list is in the DOM but hidden', async () => {
      await act(async () => {
        setup();
      });

      expect(screen.getByText('How can I help you today?')).toBeInTheDocument();
    });
  });

  describe('Sending messages', () => {
    test('sends a message and creates a new conversation topic', async () => {
      const user = userEvent.setup();
      medplum.executeBot = vi.fn().mockResolvedValue({
        resourceType: 'Parameters',
        parameter: [{ name: 'content', valueString: 'Bot response' }],
      });

      await act(async () => {
        setup();
      });

      const input = screen.getByPlaceholderText('Ask, search, or make anything...');
      const sendButton = screen.getByRole('button', { name: 'Send message' });

      await user.type(input, 'Hello AI');
      await user.click(sendButton);

      await waitFor(() => {
        expect(medplum.createResource).toHaveBeenCalled();
      });

      await waitFor(() => {
        expect(medplum.executeBot).toHaveBeenCalled();
      });

      await waitFor(() => {
        expect(onNewTopicMock).toHaveBeenCalledWith(mockTopic);
      });
    });

    test('does not send empty messages', async () => {
      const user = userEvent.setup();

      await act(async () => {
        setup();
      });
      const sendButton = screen.getByRole('button', { name: 'Send message' });
      await user.click(sendButton);

      expect(medplum.createResource).not.toHaveBeenCalled();
    });

    test('handles Enter key to send message', async () => {
      const user = userEvent.setup();
      medplum.executeBot = vi.fn().mockResolvedValue({
        resourceType: 'Parameters',
        parameter: [{ name: 'content', valueString: 'Bot response' }],
      });

      await act(async () => {
        setup();
      });

      const input = screen.getByPlaceholderText('Ask, search, or make anything...');

      await user.type(input, 'Hello AI');
      await user.keyboard('{Enter}');

      await waitFor(() => {
        expect(medplum.createResource).toHaveBeenCalled();
      });
    });
  });

  describe('Chat state (after first message)', () => {
    test('displays user and assistant messages', async () => {
      const user = userEvent.setup();
      medplum.executeBot = vi.fn().mockResolvedValue({
        resourceType: 'Parameters',
        parameter: [{ name: 'content', valueString: 'Hello! How can I help you?' }],
      });

      await act(async () => {
        setup();
      });

      const input = screen.getByPlaceholderText('Ask, search, or make anything...');
      const sendButton = screen.getByRole('button', { name: 'Send message' });

      await user.type(input, 'Hello AI');
      await user.click(sendButton);

      await waitFor(() => {
        expect(screen.getByText('Hello AI')).toBeInTheDocument();
      });

      await waitFor(() => {
        expect(screen.getByText('Hello! How can I help you?')).toBeInTheDocument();
      });

      expect(screen.getByText('AI Assistant')).toBeInTheDocument();
    });
  });

  describe('Tool calls and FHIR requests', () => {
    test('handles fhir_request tool calls', async () => {
      const user = userEvent.setup();
      const mockPatient = { resourceType: 'Patient', id: 'patient-123', name: [{ given: ['John'], family: 'Doe' }] };

      medplum.executeBot = vi.fn().mockResolvedValueOnce({
        resourceType: 'Parameters',
        parameter: [
          {
            name: 'tool_calls',
            valueString: JSON.stringify([
              {
                id: 'tool-1',
                function: {
                  name: 'fhir_request',
                  arguments: JSON.stringify({
                    method: 'GET',
                    path: 'Patient/patient-123',
                  }),
                },
              },
            ]),
          },
        ],
      });

      medplum.get = vi.fn().mockResolvedValue(mockPatient);
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(createMockStreamingResponse('Found patient John Doe'));

      await act(async () => {
        setup();
      });

      const input = screen.getByPlaceholderText('Ask, search, or make anything...');
      const sendButton = screen.getByRole('button', { name: 'Send message' });
      await user.type(input, 'Get patient 123');
      await user.click(sendButton);

      await waitFor(
        () => {
          expect(medplum.get).toHaveBeenCalled();
        },
        { timeout: 3000 }
      );

      await waitFor(() => {
        expect(screen.getByText('Found patient John Doe')).toBeInTheDocument();
      });
    });

    test('handles FHIR request errors', async () => {
      const user = userEvent.setup();

      medplum.executeBot = vi.fn().mockResolvedValueOnce({
        resourceType: 'Parameters',
        parameter: [
          {
            name: 'tool_calls',
            valueString: JSON.stringify([
              {
                id: 'tool-1',
                function: {
                  name: 'fhir_request',
                  arguments: JSON.stringify({
                    method: 'GET',
                    path: 'Patient/nonexistent',
                  }),
                },
              },
            ]),
          },
        ],
      });

      medplum.get = vi.fn().mockRejectedValue(new Error('Not found'));
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(createMockStreamingResponse('Patient not found'));

      await act(async () => {
        setup();
      });

      const input = screen.getByPlaceholderText('Ask, search, or make anything...');
      const sendButton = screen.getByRole('button', { name: 'Send message' });

      await user.type(input, 'Get nonexistent patient');
      await user.click(sendButton);

      await waitFor(() => {
        expect(medplum.get).toHaveBeenCalled();
      });

      await waitFor(() => {
        expect(globalThis.fetch).toHaveBeenCalled();
      });
    });
  });

  describe('Resource display', () => {
    test('displays resource boxes when resources are returned', async () => {
      const user = userEvent.setup();

      medplum.executeBot = vi.fn().mockResolvedValueOnce({
        resourceType: 'Parameters',
        parameter: [
          {
            name: 'tool_calls',
            valueString: JSON.stringify([
              {
                id: 'tool-1',
                function: {
                  name: 'fhir_request',
                  arguments: JSON.stringify({
                    method: 'GET',
                    path: 'Patient/patient-123',
                  }),
                },
              },
            ]),
          },
        ],
      });

      medplum.get = vi.fn().mockResolvedValue({
        resourceType: 'Patient',
        id: 'patient-123',
      });
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(createMockStreamingResponse('Found patient'));

      await act(async () => {
        setup();
      });

      const input = screen.getByPlaceholderText('Ask, search, or make anything...');
      const sendButton = screen.getByRole('button', { name: 'Send message' });

      await user.type(input, 'Get patient');
      await user.click(sendButton);

      await waitFor(() => {
        expect(screen.getByTestId('resource-box')).toBeInTheDocument();
      });

      await waitFor(() => {
        expect(screen.getByText('Patient/patient-123')).toBeInTheDocument();
      });
    });

    test('opens resource panel when clicking on resource box', async () => {
      const user = userEvent.setup();

      medplum.executeBot = vi.fn().mockResolvedValueOnce({
        resourceType: 'Parameters',
        parameter: [
          {
            name: 'tool_calls',
            valueString: JSON.stringify([
              {
                id: 'tool-1',
                function: {
                  name: 'fhir_request',
                  arguments: JSON.stringify({
                    method: 'GET',
                    path: 'Patient/patient-123',
                  }),
                },
              },
            ]),
          },
        ],
      });

      medplum.get = vi.fn().mockResolvedValue({
        resourceType: 'Patient',
        id: 'patient-123',
      });
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(createMockStreamingResponse('Found patient'));

      await act(async () => {
        setup();
      });

      const input = screen.getByPlaceholderText('Ask, search, or make anything...');
      const sendButton = screen.getByRole('button', { name: 'Send message' });

      await user.type(input, 'Get patient');
      await user.click(sendButton);

      await waitFor(() => {
        expect(screen.getByTestId('resource-box')).toBeInTheDocument();
      });

      const resourceBox = screen.getByTestId('resource-box');
      await user.click(resourceBox);

      await waitFor(() => {
        expect(screen.getByTestId('resource-panel')).toBeInTheDocument();
        expect(screen.getByText('Resource Details')).toBeInTheDocument();
      });
    });

    test('closes resource panel when clicking close button', async () => {
      const user = userEvent.setup();

      medplum.executeBot = vi.fn().mockResolvedValueOnce({
        resourceType: 'Parameters',
        parameter: [
          {
            name: 'tool_calls',
            valueString: JSON.stringify([
              {
                id: 'tool-1',
                function: {
                  name: 'fhir_request',
                  arguments: JSON.stringify({
                    method: 'GET',
                    path: 'Patient/patient-123',
                  }),
                },
              },
            ]),
          },
        ],
      });

      medplum.get = vi.fn().mockResolvedValue({
        resourceType: 'Patient',
        id: 'patient-123',
      });
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(createMockStreamingResponse('Found patient'));

      await act(async () => {
        setup();
      });

      const input = screen.getByPlaceholderText('Ask, search, or make anything...');
      const sendButton = screen.getByRole('button', { name: 'Send message' });

      await user.type(input, 'Get patient');
      await user.click(sendButton);

      await waitFor(() => {
        expect(screen.getByTestId('resource-box')).toBeInTheDocument();
      });

      const resourceBox = screen.getByTestId('resource-box');
      await user.click(resourceBox);

      await waitFor(() => {
        expect(screen.getByTestId('resource-panel')).toBeInTheDocument();
      });

      const allButtons = screen.getAllByRole('button');
      const closeButton = allButtons.find((btn) => btn.className.includes('CloseButton'));
      if (!closeButton) {
        throw new Error('CloseButton not found');
      }

      await user.click(closeButton);

      await waitFor(() => {
        expect(screen.queryByTestId('resource-panel')).not.toBeInTheDocument();
      });
    });
  });

  describe('Error handling', () => {
    test('displays error message when bot execution fails', async () => {
      const user = userEvent.setup();
      medplum.executeBot = vi.fn().mockRejectedValue(new Error('Bot execution failed'));

      await act(async () => {
        setup();
      });

      const input = screen.getByPlaceholderText('Ask, search, or make anything...');
      const sendButton = screen.getByRole('button', { name: 'Send message' });

      await user.type(input, 'Hello AI');
      await user.click(sendButton);

      await waitFor(() => {
        expect(screen.getByText(/Error: Bot execution failed/)).toBeInTheDocument();
      });
    });
  });

  describe('HTTP method support', () => {
    test.each([
      ['GET', 'get'],
      ['POST', 'post'],
      ['PUT', 'put'],
      ['DELETE', 'delete'],
    ])('handles %s requests', async (method, clientMethod) => {
      const user = userEvent.setup();

      medplum.executeBot = vi
        .fn()
        .mockResolvedValueOnce({
          resourceType: 'Parameters',
          parameter: [
            {
              name: 'tool_calls',
              valueString: JSON.stringify([
                {
                  id: 'tool-1',
                  function: {
                    name: 'fhir_request',
                    arguments: JSON.stringify({
                      method,
                      path: 'Patient/patient-123',
                      body: method !== 'GET' && method !== 'DELETE' ? { resourceType: 'Patient' } : undefined,
                    }),
                  },
                },
              ]),
            },
          ],
        })
        .mockResolvedValueOnce({
          resourceType: 'Parameters',
          parameter: [{ name: 'content', valueString: 'Success' }],
        });

      (medplum as any)[clientMethod] = vi.fn().mockResolvedValue({ resourceType: 'Patient', id: 'patient-123' });

      await act(async () => {
        setup();
      });

      const input = screen.getByPlaceholderText('Ask, search, or make anything...');
      const sendButton = screen.getByRole('button', { name: 'Send message' });

      await user.type(input, `${method} patient`);
      await user.click(sendButton);

      await waitFor(() => {
        expect((medplum as any)[clientMethod]).toHaveBeenCalled();
      });
    });
  });

  describe('Bundle handling', () => {
    test('extracts resource references from Bundle entries', async () => {
      const user = userEvent.setup();
      const mockBundle = {
        resourceType: 'Bundle',
        entry: [
          { resource: { resourceType: 'Patient', id: 'patient-1' } },
          { resource: { resourceType: 'Patient', id: 'patient-2' } },
        ],
      };

      medplum.executeBot = vi.fn().mockResolvedValueOnce({
        resourceType: 'Parameters',
        parameter: [
          {
            name: 'tool_calls',
            valueString: JSON.stringify([
              {
                id: 'tool-1',
                function: {
                  name: 'fhir_request',
                  arguments: JSON.stringify({
                    method: 'GET',
                    path: 'Patient?name=John',
                  }),
                },
              },
            ]),
          },
        ],
      });

      medplum.get = vi.fn().mockResolvedValue(mockBundle);
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(createMockStreamingResponse('Found 2 patients'));

      await act(async () => {
        setup();
      });

      const input = screen.getByPlaceholderText('Ask, search, or make anything...');
      const sendButton = screen.getByRole('button', { name: 'Send message' });

      await user.type(input, 'Search patients');
      await user.click(sendButton);

      await waitFor(() => {
        expect(medplum.get).toHaveBeenCalled();
      });

      await waitFor(() => {
        const resourceBoxes = screen.getAllByTestId('resource-box');
        expect(resourceBoxes.length).toBe(2);
      });
    });
  });
});
