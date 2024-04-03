import { Button } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { capitalize, MedplumClient, normalizeErrorString } from '@medplum/core';
import { Bundle } from '@medplum/fhirtypes';
import { Document, useMedplum } from '@medplum/react';
import { IconCircleCheck, IconCircleOff } from '@tabler/icons-react';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import coreData from '../../data/core/core-data.json';
import exampleData from '../../data/example/example-data.json';

export function UploadDataPage(): JSX.Element {
  const medplum = useMedplum();
  const { dataType } = useParams();
  const navigate = useNavigate();
  const dataTypeDisplay = dataType ? capitalize(dataType) : '';
  const [buttonDisabled, setButtonDisabled] = useState<boolean>(false);

  const handleDataUpload = (): void => {
    setButtonDisabled(true);
    let uploadFunction: (medlum: MedplumClient) => Promise<void>;
    if (dataType === 'core') {
      uploadFunction = uploadCoreData;
    } else {
      uploadFunction = uploadExampleData;
    }

    uploadFunction(medplum)
      .then(() => navigate('/'))
      .catch((error) => {
        showNotification({
          color: 'red',
          icon: <IconCircleOff />,
          title: 'Error',
          message: normalizeErrorString(error),
        });
      });
  };

  return (
    <Document>
      <Button disabled={buttonDisabled} onClick={handleDataUpload}>{`Upload ${dataTypeDisplay} Data`}</Button>
    </Document>
  );
}

async function uploadCoreData(medplum: MedplumClient): Promise<void> {
  await medplum.executeBatch(coreData as Bundle);
  showNotification({
    icon: <IconCircleCheck />,
    title: 'Success',
    message: 'Core data uploaded',
  });
}

async function uploadExampleData(medplum: MedplumClient): Promise<void> {
  await medplum.executeBatch(exampleData as Bundle);
  showNotification({
    icon: <IconCircleCheck />,
    title: 'Success',
    message: 'Example data uploaded',
  });
}
