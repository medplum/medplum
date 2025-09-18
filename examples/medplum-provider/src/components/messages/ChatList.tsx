// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Divider, Stack } from '@mantine/core';
import { Communication } from '@medplum/fhirtypes';
import { Fragment, JSX } from 'react';
import { ChatListItem } from './ChatListItem';

interface ChatListProps {
  threads: [Communication, Communication | undefined][];
  selectedCommunication: Communication | undefined;
  onSelectedItem: (topic: Communication) => string;
}

export const ChatList = (props: ChatListProps): JSX.Element => {
  const { threads, selectedCommunication, onSelectedItem } = props;

  return (
    <Stack gap={0}>
      {threads.map((thread: [Communication, Communication | undefined]) => {
        const topicCommunication = thread[0];
        const lastCommunication = thread[1];
        const _isSelected = selectedCommunication?.id === topicCommunication.id;
        return (
          <Fragment key={topicCommunication.id}>
            <ChatListItem
              topic={topicCommunication}
              lastCommunication={lastCommunication}
              isSelected={_isSelected}
              onSelectedItem={onSelectedItem}
            />
            <Divider />
          </Fragment>
        );
      })}
    </Stack>
  );
};
