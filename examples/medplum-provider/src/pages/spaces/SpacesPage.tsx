// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Communication, Reference } from '@medplum/fhirtypes';
import type { JSX } from 'react';
import { useNavigate, useParams } from 'react-router';
import { SpaceInbox } from '../../components/spaces/SpaceInbox';
import classes from './SpacesPage.module.css';

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

  return (
    <div className={classes.container}>
      <SpaceInbox topic={topicRef} onNewTopic={handleNewTopic} onSelectedItem={onSelectedItem} />
    </div>
  );
}
