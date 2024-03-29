import { Button } from '@mantine/core';
import { MedplumClient, capitalize, isOk, normalizeErrorString } from '@medplum/core';
import { Document, useMedplum } from '@medplum/react';
import { useParams, useNavigate } from 'react-router-dom';

import { showNotification } from '@mantine/notifications';
import { Bundle, ValueSet } from '@medplum/fhirtypes';
import { IconCircleCheck, IconCircleOff } from '@tabler/icons-react';
import { useCallback, useState } from 'react';
import businessStatusValueSet from '../../data/core/business-status-valueset.json';
import practitionerRoleValueSet from '../../data/core/practitioner-role-valueset.json';
import taskTypeValueSet from '../../data/core/task-type-valueset.json';
import exampleMessageData from '../../data/example/example-messages.json';
import exampleReportData from '../../data/example/example-reports.json';
import exampleTaskData from '../../data/example/example-tasks.json';

export function UploadDataPage(): JSX.Element {
  const medplum = useMedplum();
  const { dataType } = useParams();
  const navigate = useNavigate();
  const [buttonDisabled, setButtonDisabled] = useState<boolean>(false);

  const dataTypeDisplay = dataType ? capitalize(dataType) : '';

  const handleUpload = useCallback(() => {
    setButtonDisabled(true);
    let uploadFunction: (medplum: MedplumClient) => Promise<void>;
    switch (dataType) {
      case 'core':
        uploadFunction = uploadCoreData;
        break;
      case 'task':
        uploadFunction = uploadExampleTaskData;
        break;
      case 'message':
        uploadFunction = uploadExampleMessageData;
        break;
      case 'report':
        uploadFunction = uploadExampleReportData;
        break;
      default:
        throw new Error(`Invalid upload type '${dataType}'`);
    }

    uploadFunction(medplum)
      .then(() => navigate(-1))
      .catch((error) => {
        showNotification({
          color: 'red',
          icon: <IconCircleOff />,
          title: 'Error',
          message: normalizeErrorString(error),
        });
      })
      .finally(() => setButtonDisabled(false));
  }, [medplum, dataType, navigate]);

  return (
    <Document>
      <Button disabled={buttonDisabled} onClick={handleUpload}>{`Upload ${dataTypeDisplay} Data`}</Button>
    </Document>
  );
}

async function uploadCoreData(medplum: MedplumClient): Promise<void> {
  // Upload all the core ValueSets in a single batch request
  const valueSets: ValueSet[] = [
    businessStatusValueSet as ValueSet,
    taskTypeValueSet as ValueSet,
    practitionerRoleValueSet as ValueSet,
  ];

  const result = await medplum.executeBatch({
    resourceType: 'Bundle',
    type: 'batch',
    entry: valueSets.map((valueSet) => ({
      request: { method: 'POST', url: valueSet.resourceType, ifNoneExist: `url=${valueSet.url}` },
      resource: valueSet,
    })),
  });

  showNotification({
    icon: <IconCircleCheck />,
    title: 'Success',
    message: 'Uploaded Business Statuses',
  });

  if (result.entry?.every((entry) => entry.response?.outcome && isOk(entry.response?.outcome))) {
    await setTimeout(
      () =>
        showNotification({
          icon: <IconCircleCheck />,
          title: 'Success',
          message: 'Uploaded Business Statuses',
        }),
      1000
    );
  } else {
    throw new Error('Error uploading core data');
  }
}

async function uploadExampleMessageData(medplum: MedplumClient): Promise<void> {
  await medplum.executeBatch(exampleMessageData as Bundle);
  showNotification({
    icon: <IconCircleCheck />,
    title: 'Success',
    message: 'Uploaded Example Messages',
  });
}

async function uploadExampleReportData(medplum: MedplumClient): Promise<void> {
  await medplum.executeBatch(exampleReportData as Bundle);
  showNotification({
    icon: <IconCircleCheck />,
    title: 'Success',
    message: 'Uploaded Example Report',
  });
}

async function uploadExampleTaskData(medplum: MedplumClient): Promise<void> {
  await medplum.executeBatch(exampleTaskData as Bundle);
  showNotification({
    icon: <IconCircleCheck />,
    title: 'Success',
    message: 'Uploaded Example Tasks',
  });
}
