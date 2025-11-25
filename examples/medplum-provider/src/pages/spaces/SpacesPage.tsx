// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Communication } from '@medplum/fhirtypes';
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

  const handleNewTopic = (topic: Communication): void => {
    navigate(`/Spaces/Communication/${topic.id}`)?.catch(console.error);
  };

  const onSelectedItem = (topic: Communication): string => {
    return `/Spaces/Communication/${topic.id}`;
  };

  return (
    <div className={classes.container}>
      <SpaceInbox topicId={topicId} onNewTopic={handleNewTopic} onSelectedItem={onSelectedItem} />
    </div>
  );
}
