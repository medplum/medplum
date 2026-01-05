// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Communication, Reference } from '@medplum/fhirtypes';
import type { JSX } from 'react';
import { useNavigate, useParams } from 'react-router';
import classes from './SpacesPage.module.css';
import { SpacesInbox } from '../../components/spaces/SpacesInbox';

/**
 * SpacesPage component that handles routing for AI conversation spaces.
 * Follows the same pattern as MessagesPage by delegating all logic to SpaceInbox.
 * @returns A React component that displays the AI conversation interface.
 */
export function SpacesPage(): JSX.Element {
  const { topicId } = useParams();
  const navigate = useNavigate();

  const handleNewTopic = (newTopic: Communication): void => {
    navigate(`/Spaces/Communication/${newTopic.id}`)?.catch(console.error);
  };

  const onSelectedItem = (selectedTopic: Communication): string => {
    return `/Spaces/Communication/${selectedTopic.id}`;
  };

  const topicRef: Reference<Communication> | undefined = topicId
    ? { reference: `Communication/${topicId}` }
    : undefined;

  const handleNewConversation = (): void => {
    navigate('/Spaces/Communication')?.catch(console.error);
  };

  return (
    <div className={classes.container}>
      <SpacesInbox
        topic={topicRef}
        onNewTopic={handleNewTopic}
        onSelectedItem={onSelectedItem}
        onAdd={handleNewConversation}
      />
    </div>
  );
}
