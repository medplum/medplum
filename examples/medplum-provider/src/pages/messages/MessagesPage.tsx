// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Communication } from '@medplum/fhirtypes';
import { JSX } from 'react';
import { useNavigate, useParams } from 'react-router';
import { ThreadInbox } from '../../components/messages/ThreadInbox';
import classes from './MessagesPage.module.css';
/**
 * Fetches
 * @returns A React component that displays all Threads/Topics.
 */
export function MessagesPage(): JSX.Element {
  const { messageId } = useParams();
  const navigate = useNavigate();

  const handleNewThread = (message: Communication): void => {
    navigate(`/Message/${message.id}`)?.catch(console.error);
  };

  const onSelectedItem = (topic: Communication): string => {
    return `/Message/${topic.id}`;
  };

  return (
    <div className={classes.container}>
      <ThreadInbox
        threadId={messageId}
        query="_sort=-_lastUpdated"
        showPatientSummary={true}
        handleNewThread={handleNewThread}
        onSelectedItem={onSelectedItem}
      />
    </div>
  );
}
