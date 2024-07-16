import { Button, LoadingOverlay } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { capitalize, isOk, MedplumClient } from '@medplum/core';
import { Bundle } from '@medplum/fhirtypes';
import { Document, useMedplum } from '@medplum/react';
import { IconCircleCheck, IconCircleOff } from '@tabler/icons-react';
import { useCallback, useState } from 'react';
import { useParams } from 'react-router-dom';
import coreData from '../../data/core/patient-intake-questionnaire.json';
import exampleData from '../../data/example/example-patient-data.json';

type UploadFunction = (medplum: MedplumClient, data: Bundle) => Promise<void>;

export function UploadDataPage(): JSX.Element {
  const medplum = useMedplum();
  const [pageDisabled, setPageDisabled] = useState<boolean>(false);

  const { dataType } = useParams();
  const dataTypeDisplay = dataType ? capitalize(dataType) : '';
  const buttonDisabled = dataType === 'bots';

  const handleUpload = useCallback(() => {
    setPageDisabled(true);
    let uploadFunction: UploadFunction;
    let data: Bundle;
    switch (dataType) {
      case 'core':
        data = coreData as Bundle;
        uploadFunction = uploadData;
        break;
      case 'example':
        data = exampleData as Bundle;
        uploadFunction = uploadData;
        break;
      default:
        showNotification({
          color: 'red',
          icon: <IconCircleOff />,
          title: 'Error',
          message: `Invalid upload type: ${dataType}`,
        });
        setPageDisabled(false);
        return;
    }

    uploadFunction(medplum, data)
      .then(() => {
        showNotification({
          icon: <IconCircleCheck />,
          title: 'Success',
          message: `Uploaded ${dataTypeDisplay} data`,
        });
      })
      .catch(() => {
        showNotification({
          color: 'red',
          icon: <IconCircleOff />,
          title: 'Error',
          message: `Error uploading ${dataTypeDisplay} data`,
        });
      })
      .finally(() => setPageDisabled(false));
  }, [medplum, dataType, dataTypeDisplay]);

  return (
    <Document>
      <LoadingOverlay visible={pageDisabled} />
      <Button disabled={buttonDisabled} onClick={handleUpload}>
        Upload {dataTypeDisplay} data
      </Button>
    </Document>
  );
}

async function uploadData(medplum: MedplumClient, data: Bundle): Promise<void> {
  const result = await medplum.executeBatch(data);

  if (result.entry?.every((entry) => entry.response?.outcome && !isOk(entry.response?.outcome))) {
    throw new Error('Error on upload.');
  }
}
