import { Button, LoadingOverlay } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { capitalize, isOk, MedplumClient, normalizeErrorString } from '@medplum/core';
import { Bundle, Practitioner } from '@medplum/fhirtypes';
import { Document, useMedplum, useMedplumProfile } from '@medplum/react';
import { IconCircleCheck, IconCircleOff } from '@tabler/icons-react';
import { useCallback, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import exampleData from '../../data/example/example-patient-data.json';

type UploadFunction =
  | ((medplum: MedplumClient, profile: Practitioner) => Promise<void>)
  | ((medplum: MedplumClient) => Promise<void>);

export function UploadDataPage(): JSX.Element {
  const medplum = useMedplum();
  const profile = useMedplumProfile();
  const navigate = useNavigate();
  const [pageDisabled, setPageDisabled] = useState<boolean>(false);

  const { dataType } = useParams();
  const dataTypeDisplay = dataType ? capitalize(dataType) : '';
  const buttonDisabled = dataType === 'bots';

  const handleUpload = useCallback(() => {
    setPageDisabled(true);
    let uploadFunction: UploadFunction;
    switch (dataType) {
      case 'example':
        uploadFunction = uploadExampleData;
        break;
      default:
        throw new Error(`Invalid upload type: ${dataType}`);
    }

    uploadFunction(medplum, profile as Practitioner)
      .then(() => navigate(-1))
      .catch((error) => {
        showNotification({
          color: 'red',
          icon: <IconCircleOff />,
          title: 'Error',
          message: normalizeErrorString(error),
        });
      })
      .finally(() => setPageDisabled(false));
  }, [medplum, profile, dataType, navigate]);

  return (
    <Document>
      <LoadingOverlay visible={pageDisabled} />
      <Button disabled={buttonDisabled} onClick={handleUpload}>
        Upload {dataTypeDisplay} data
      </Button>
    </Document>
  );
}

async function uploadExampleData(medplum: MedplumClient): Promise<void> {
  const exampleDataBatch = exampleData as Bundle;
  const result = await medplum.executeBatch(exampleDataBatch);

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
