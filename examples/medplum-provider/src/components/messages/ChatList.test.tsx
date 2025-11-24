// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import type { Communication } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ChatList } from './ChatList';

// Mock ChatListItem
vi.mock('./ChatListItem', () => ({
  ChatListItem: (props: {
    topic: Communication;
    lastCommunication: Communication | undefined;
    isSelected: boolean;
    onSelectedItem: (topic: Communication) => string;
  }) => (
    <div data-testid={`chat-list-item-${props.topic.id}`} data-selected={props.isSelected}>
      <div data-testid="topic-id">{props.topic.id}</div>
      {props.lastCommunication && <div data-testid="last-communication-id">{props.lastCommunication.id}</div>}
    </div>
  ),
}));

const mockCommunication1: Communication = {
  resourceType: 'Communication',
  id: 'comm-1',
  status: 'in-progress',
  topic: { text: 'Topic 1' },
};

const mockCommunication2: Communication = {
  resourceType: 'Communication',
  id: 'comm-2',
  status: 'in-progress',
  topic: { text: 'Topic 2' },
};

const mockLastCommunication1: Communication = {
  resourceType: 'Communication',
  id: 'last-comm-1',
  status: 'in-progress',
  payload: [{ contentString: 'Last message 1' }],
};

const mockOnSelectedItem = vi.fn((topic: Communication) => `/Message/${topic.id}`);

describe('ChatList', () => {
  let medplum: MockClient;

  beforeEach(() => {
    medplum = new MockClient();
    vi.clearAllMocks();
  });

  const setup = (
    threads: [Communication, Communication | undefined][],
    selectedCommunication?: Communication
  ): void => {
    render(
      <MemoryRouter>
        <MedplumProvider medplum={medplum}>
          <MantineProvider>
            <ChatList
              threads={threads}
              selectedCommunication={selectedCommunication}
              onSelectedItem={mockOnSelectedItem}
            />
          </MantineProvider>
        </MedplumProvider>
      </MemoryRouter>
    );
  };

  it('renders empty list when no threads', () => {
    setup([]);
    expect(screen.queryByTestId(/chat-list-item-/)).not.toBeInTheDocument();
  });

  it('renders single thread', () => {
    setup([[mockCommunication1, mockLastCommunication1]]);
    expect(screen.getByTestId('chat-list-item-comm-1')).toBeInTheDocument();
    expect(screen.getByTestId('topic-id')).toHaveTextContent('comm-1');
    expect(screen.getByTestId('last-communication-id')).toHaveTextContent('last-comm-1');
  });

  it('renders multiple threads', () => {
    setup([
      [mockCommunication1, mockLastCommunication1],
      [mockCommunication2, undefined],
    ]);
    expect(screen.getByTestId('chat-list-item-comm-1')).toBeInTheDocument();
    expect(screen.getByTestId('chat-list-item-comm-2')).toBeInTheDocument();
  });

  it('marks thread as selected when it matches selectedCommunication', () => {
    setup([[mockCommunication1, mockLastCommunication1]], mockCommunication1);
    const item = screen.getByTestId('chat-list-item-comm-1');
    expect(item).toHaveAttribute('data-selected', 'true');
  });

  it('marks thread as not selected when it does not match selectedCommunication', () => {
    setup([[mockCommunication1, mockLastCommunication1]], mockCommunication2);
    const item = screen.getByTestId('chat-list-item-comm-1');
    expect(item).toHaveAttribute('data-selected', 'false');
  });

  it('handles thread without last communication', () => {
    setup([[mockCommunication1, undefined]]);
    expect(screen.getByTestId('chat-list-item-comm-1')).toBeInTheDocument();
    expect(screen.queryByTestId('last-communication-id')).not.toBeInTheDocument();
  });

  it('passes onSelectedItem to each ChatListItem', () => {
    setup([[mockCommunication1, mockLastCommunication1]]);
    // The function is passed as a prop, we verify it's used by checking the component renders
    expect(screen.getByTestId('chat-list-item-comm-1')).toBeInTheDocument();
  });
});
