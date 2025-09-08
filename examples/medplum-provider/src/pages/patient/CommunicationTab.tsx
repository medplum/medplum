// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Communication } from '@medplum/fhirtypes';
import { JSX } from 'react';
import { ThreadInbox } from '../../components/messages/ThreadInbox';
import { useNavigate, useParams } from 'react-router';

export function CommunicationTab(): JSX.Element {
  const { patientId, messageId } = useParams();
  const navigate = useNavigate();

  const onSelectedItem = (topic: Communication): string => {
    return `/Patient/${patientId}/Message/${topic.id}`;
  };

  const handleNewThread = (message: Communication): void => {
    navigate(`/Patient/${patientId}/Message/${message.id}`)?.catch(console.error);
  };

  return (
    <div style={{ height: `calc(100vh - 98px)` }}>
      <ThreadInbox
        threadId={messageId}
        query={`subject=${`Patient/${patientId}`},_sort=-_lastUpdated`}
        showPatientSummary={false}
        handleNewThread={handleNewThread}
        onSelectedItem={onSelectedItem}
      />
    </div>
  );
}
