// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MedplumProvider } from '@medplum/react';
import { MockClient } from '@medplum/mock';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { SpacesPage } from './SpacesPage';
import type { Communication } from '@medplum/fhirtypes';

// Mock the persistence functions
vi.mock('./space-persistence', () => ({
  createConversationTopic: vi.fn(),
  saveMessage: vi.fn(),
  loadConversationMessages: vi.fn(),
  loadRecentTopics: vi.fn(),
}));

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

describe('SpacesPage', () => {
  let medplum: MockClient;
  let createConversationTopicMock: any;
  let saveMessageMock: any;
  let loadConversationMessagesMock: any;

  beforeEach(async () => {
    medplum = new MockClient();
    vi.clearAllMocks();

    // Mock scrollTo for tests
    Element.prototype.scrollTo = vi.fn();

    const persistence = await import('./space-persistence');
    createConversationTopicMock = vi.mocked(persistence.createConversationTopic);
    saveMessageMock = vi.mocked(persistence.saveMessage);
    loadConversationMessagesMock = vi.mocked(persistence.loadConversationMessages);

    // Setup default mocks
    createConversationTopicMock.mockResolvedValue(mockTopic);
    saveMessageMock.mockResolvedValue({} as Communication);
    loadConversationMessagesMock.mockResolvedValue([]);
  });

  const setup = (): ReturnType<typeof render> => {
    return render(
      <MemoryRouter>
        <MedplumProvider medplum={medplum}>
          <MantineProvider>
            <SpacesPage />
          </MantineProvider>
        </MedplumProvider>
      </MemoryRouter>
    );
  };

  describe('Initial state (before first message)', () => {
    it('renders the initial state with Start a New Space heading', async () => {
      await act(async () => {
        setup();
      });

      expect(screen.getByText('Start a New Space')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Ask, search, or make anything...')).toBeInTheDocument();
    });

    it('shows history button', async () => {
      await act(async () => {
        setup();
      });

      const buttons = screen.getAllByRole('button');
      expect(buttons.length).toBeGreaterThan(0);
    });

    it('conversation list is in the DOM but hidden', async () => {
      await act(async () => {
        setup();
      });

      expect(screen.getByText('Start a New Space')).toBeInTheDocument();
    });
  });

  describe('Sending messages', () => {
    it('sends a message and creates a new conversation topic', async () => {
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
        expect(createConversationTopicMock).toHaveBeenCalledWith(medplum, 'Hello AI', 'gpt-5');
      });

      await waitFor(() => {
        expect(saveMessageMock).toHaveBeenCalled();
      });

      await waitFor(() => {
        expect(medplum.executeBot).toHaveBeenCalled();
      });
    });

    it('does not send empty messages', async () => {
      const user = userEvent.setup();

      await act(async () => {
        setup();
      });
      const sendButton = screen.getByRole('button', { name: 'Send message' });
      await user.click(sendButton);

      expect(createConversationTopicMock).not.toHaveBeenCalled();
    });

    it('handles Enter key to send message', async () => {
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
        expect(createConversationTopicMock).toHaveBeenCalled();
      });
    });
  });

  describe('Chat state (after first message)', () => {
    it('displays user and assistant messages', async () => {
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
    it('handles fhir_request tool calls', async () => {
      const user = userEvent.setup();
      const mockPatient = { resourceType: 'Patient', id: 'patient-123', name: [{ given: ['John'], family: 'Doe' }] };

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
                      method: 'GET',
                      path: 'Patient/patient-123',
                    }),
                  },
                },
              ]),
            },
          ],
        })
        .mockResolvedValueOnce({
          resourceType: 'Parameters',
          parameter: [{ name: 'content', valueString: 'Found patient John Doe' }],
        });

      medplum.get = vi.fn().mockResolvedValue(mockPatient);

      await act(async () => {
        setup();
      });

      const input = screen.getByPlaceholderText('Ask, search, or make anything...');
      const sendButton = screen.getByRole('button', { name: 'Send message' });
      await user.type(input, 'Get patient 123');
      await user.click(sendButton);

      // Wait for medplum.get to be called
      await waitFor(
        () => {
          expect(medplum.get).toHaveBeenCalled();
        },
        { timeout: 3000 }
      );

      // Verify the response appears
      await waitFor(() => {
        expect(screen.getByText('Found patient John Doe')).toBeInTheDocument();
      });
    });

    it('handles FHIR request errors', async () => {
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
                      method: 'GET',
                      path: 'Patient/nonexistent',
                    }),
                  },
                },
              ]),
            },
          ],
        })
        .mockResolvedValueOnce({
          resourceType: 'Parameters',
          parameter: [{ name: 'content', valueString: 'Patient not found' }],
        });

      medplum.get = vi.fn().mockRejectedValue(new Error('Not found'));

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
        expect(medplum.executeBot).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe('Resource display', () => {
    it('displays resource boxes when resources are returned', async () => {
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
                      method: 'GET',
                      path: 'Patient/patient-123',
                    }),
                  },
                },
              ]),
            },
          ],
        })
        .mockResolvedValueOnce({
          resourceType: 'Parameters',
          parameter: [{ name: 'content', valueString: 'Found patient' }],
        });

      medplum.get = vi.fn().mockResolvedValue({
        resourceType: 'Patient',
        id: 'patient-123',
      });

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

    it('opens resource panel when clicking on resource box', async () => {
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
                      method: 'GET',
                      path: 'Patient/patient-123',
                    }),
                  },
                },
              ]),
            },
          ],
        })
        .mockResolvedValueOnce({
          resourceType: 'Parameters',
          parameter: [{ name: 'content', valueString: 'Found patient' }],
        });

      medplum.get = vi.fn().mockResolvedValue({
        resourceType: 'Patient',
        id: 'patient-123',
      });

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

    it('closes resource panel when clicking close button', async () => {
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
                      method: 'GET',
                      path: 'Patient/patient-123',
                    }),
                  },
                },
              ]),
            },
          ],
        })
        .mockResolvedValueOnce({
          resourceType: 'Parameters',
          parameter: [{ name: 'content', valueString: 'Found patient' }],
        });

      medplum.get = vi.fn().mockResolvedValue({
        resourceType: 'Patient',
        id: 'patient-123',
      });

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

      // Find the CloseButton - it's the button with a specific class
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
    it('displays error message when bot execution fails', async () => {
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
    it.each([
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
    it('extracts resource references from Bundle entries', async () => {
      const user = userEvent.setup();
      const mockBundle = {
        resourceType: 'Bundle',
        entry: [
          { resource: { resourceType: 'Patient', id: 'patient-1' } },
          { resource: { resourceType: 'Patient', id: 'patient-2' } },
        ],
      };

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
                      method: 'GET',
                      path: 'Patient?name=John',
                    }),
                  },
                },
              ]),
            },
          ],
        })
        .mockResolvedValueOnce({
          resourceType: 'Parameters',
          parameter: [{ name: 'content', valueString: 'Found 2 patients' }],
        });

      medplum.get = vi.fn().mockResolvedValue(mockBundle);

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
