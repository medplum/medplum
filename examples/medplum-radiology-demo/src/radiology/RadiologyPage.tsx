// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Box, Text } from '@mantine/core';
import type { DiagnosticReport, ImagingStudy, Patient, Reference, Task } from '@medplum/fhirtypes';
import { Loading, PatientSummary, useMedplum, useResource } from '@medplum/react';
import type { JSX } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { showErrorNotification } from '../utils/notifications';
import { FhircastPanel } from './FhircastPanel';
import { getOrCreateDraftReport, getTaskImagingStudy, publishStudyChange } from './radiology-utils';
import classes from './RadiologyPage.module.css';
import { RadiologyWorklist } from './RadiologyWorklist';
import { ReportCreator } from './ReportCreator';

export function RadiologyPage(): JSX.Element {
  const { taskId } = useParams();
  const navigate = useNavigate();
  const medplum = useMedplum();
  const task = useResource<Task>(taskId ? { reference: `Task/${taskId}` } : undefined);
  const [draft, setDraft] = useState<{ taskId: string; report: DiagnosticReport }>();
  const [connectedTopic, setConnectedTopic] = useState<string>();

  const patient = task?.for as Reference<Patient> | undefined;
  const study = useResource<ImagingStudy>(task ? getTaskImagingStudy(task) : undefined);

  useEffect(() => {
    if (!task?.id || !patient) {
      return;
    }
    const openedTaskId = task.id;
    getOrCreateDraftReport(medplum, task, patient)
      .then((report) => setDraft({ taskId: openedTaskId, report }))
      .catch(showErrorNotification);
  }, [medplum, task, patient]);

  // Only show a draft that belongs to the Task in the URL, so a slow load never renders the
  // previous radiologist's report against the newly selected study.
  const report = draft && draft.taskId === taskId ? draft.report : undefined;

  // The study the topic currently has open. Tracked in a ref because it is the published context
  // rather than rendered state, and the close event needs the study that is being replaced.
  const openStudyRef = useRef<ImagingStudy>(undefined);

  useEffect(() => {
    // Disconnecting drops our claim on the topic; a later reconnect re-opens from scratch.
    if (!connectedTopic) {
      openStudyRef.current = undefined;
      return;
    }
    const previous = openStudyRef.current;
    if (previous?.id === study?.id) {
      return;
    }
    openStudyRef.current = study;
    publishStudyChange(medplum, connectedTopic, previous, study).catch(showErrorNotification);
  }, [medplum, connectedTopic, study]);

  const onSelect = (next: Task): void => {
    navigate(`/Radiology/${next.id}`)?.catch(console.error);
  };

  const onConnectedTopicChange = useCallback((topic: string | undefined): void => setConnectedTopic(topic), []);

  return (
    <div className={classes.container}>
      <Box p="xs">
        <FhircastPanel onConnectedTopicChange={onConnectedTopicChange} />
      </Box>
      <div className={classes.body}>
        <div className={classes.worklist}>
          <RadiologyWorklist selectedTaskId={taskId} onSelect={onSelect} />
        </div>
        <div className={classes.report}>
          {!taskId && (
            <Text p="md" c="dimmed">
              Select a study from the worklist to start a report.
            </Text>
          )}
          {taskId && (!task || !report) && <Loading />}
          {/* Keyed on the draft so switching worklist items remounts with a clean, unsaved editor. */}
          {task && report && <ReportCreator key={report.id} task={task} report={report} />}
        </div>
        {patient && (
          <div className={classes.chart}>
            <PatientSummary patient={patient} />
          </div>
        )}
      </div>
    </div>
  );
}
