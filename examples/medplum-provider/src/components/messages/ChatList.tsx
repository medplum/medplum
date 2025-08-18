// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Divider, Stack } from '@mantine/core';
import { Communication } from '@medplum/fhirtypes';
import { JSX } from 'react';
import { ChatListItem } from './ChatListItem';

interface ChatListProps {
  threads: [Communication, Communication][];
  selectedCommunication: Communication | undefined;
}

export const ChatList = (props: ChatListProps): JSX.Element => {
  const { threads, selectedCommunication } = props;

  return (
    <Stack gap={0}>
      {threads.map((thread: [Communication, Communication]) => {
        const topicCommunication = thread[0];
        const lastCommunication = thread[1];
        const _isSelected = selectedCommunication?.id === topicCommunication.id;
        return (
          <>
            <ChatListItem
              key={topicCommunication.id}
              topic={topicCommunication}
              lastCommunication={lastCommunication}
              isSelected={_isSelected}
            />
            <Divider />
          </>
        );
      })}
    </Stack>
  );
};
