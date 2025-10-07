// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Button, Flex, Modal } from '@mantine/core';
import type { DiagnosticReport, Task } from '@medplum/fhirtypes';
import { CodeableConceptDisplay, DiagnosticReportDisplay, useMedplum } from '@medplum/react';
import { IconCircleCheck } from '@tabler/icons-react';
import { useState } from 'react';
import type { JSX } from 'react';
import type { TaskCellProps } from './TaskList';

export function DiagnosticReportModal(props: TaskCellProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const medplum = useMedplum();
  const report = props.resource as DiagnosticReport;

  async function handleClick(): Promise<void> {
    await medplum.updateResource<Task>({ ...props.task, status: 'completed' });
    setReviewed(true);
  }
  if (reviewed) {
    return <IconCircleCheck color="#79d290" size={48} />;
  }
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)} style={{ color: '#4EB180', borderColor: '#4EB180' }}>
        Review {<CodeableConceptDisplay value={report.code} />}
      </Button>
      <Modal opened={open} onClose={() => setOpen(false)} size="xl">
        <DiagnosticReportDisplay value={report} />
        <Flex justify="flex-end">
          <Button mt={8} onClick={handleClick}>
            Release
          </Button>
        </Flex>
      </Modal>
    </>
  );
}
