import { Button } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { capitalize, MedplumClient } from '@medplum/core';
import { Bundle, BundleEntry, Resource, ValueSet } from '@medplum/fhirtypes';
import { Document, useMedplum } from '@medplum/react';
import { IconCircleCheck } from '@tabler/icons-react';
import { useParams } from 'react-router-dom';
import x12ServiceTypeCodes from '../../data/core/x12-service-type-codes.json';

export function UploadDataPage(): JSX.Element {
  const medplum = useMedplum();
  const { dataType } = useParams();
  const dataTypeDisplay = dataType ? capitalize(dataType) : '';
  const data = x12ServiceTypeCodes as ValueSet;

  const dataBundle = createBundle([data]);

  const handleDataUpload = () => {
    console.log(dataBundle);
  };

  return (
    <Document>
      <Button onClick={handleDataUpload}>{`Upload ${dataTypeDisplay} Data`}</Button>
    </Document>
  );
}

async function uploadData(medplum: MedplumClient, data: Bundle) {
  await medplum.executeBatch(data);
  showNotification({
    icon: <IconCircleCheck />,
    title: 'Success',
    message: 'Data uploaded',
  });
}

function createBundle(data: Resource[]): Bundle {
  const entries = data.map((resource) => {
    const entry: BundleEntry = {
      request: { method: 'POST', url: resource.resourceType },
      resource,
    };
    return entry;
  });

  const bundle: Bundle = {
    resourceType: 'Bundle',
    type: 'batch',
    entry: entries,
  };

  return bundle;
}
