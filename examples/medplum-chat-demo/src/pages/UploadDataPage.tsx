import { Button } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { capitalize, MedplumClient, normalizeErrorString } from '@medplum/core';
import { Bundle } from '@medplum/fhirtypes';
import { Document, useMedplum } from '@medplum/react';
import { IconCircleCheck, IconCircleOff } from '@tabler/icons-react';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import exampleDataSet from '../../data/example/example-data.json';

export function UploadDataPage(): JSX.Element {
  const medplum = useMedplum();
  const navigate = useNavigate();
  const [buttonDisabled, setButtonDisabled] = useState<boolean>(false);

  // Get the data type and capitalize the first letter
  const { dataType } = useParams();
  const dataTypeDisplay = dataType ? capitalize(dataType) : '';

  function handleDataUpload(): void {
    setButtonDisabled(true);
    uploadData(medplum, dataType)
      .then(() => navigate('/'))
      .catch((err) => {
        showNotification({
          color: 'red',
          icon: <IconCircleOff />,
          title: 'Error',
          message: normalizeErrorString(err),
        });
      })
      .finally(() => setButtonDisabled(false));
  }

  return (
    <Document>
      <Button disabled={buttonDisabled} onClick={handleDataUpload}>
        Upload {dataTypeDisplay} Data
      </Button>
    </Document>
  );
}

async function uploadData(medplum: MedplumClient, dataType?: string): Promise<void> {
  if (dataType === 'example') {
    await medplum.executeBatch(exampleDataSet as Bundle);
    showNotification({
      icon: <IconCircleCheck />,
      title: 'Success',
      message: `${capitalize(dataType)} data uploaded`,
    });
  } else {
    throw new Error('Invalid data type');
  }
}
