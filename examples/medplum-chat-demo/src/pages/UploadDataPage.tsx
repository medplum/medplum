import { Button } from '@mantine/core';
import { capitalize } from '@medplum/core';
import { useParams } from 'react-router-dom';

export function UploadDataPage(): JSX.Element {
  const { dataType } = useParams();
  const dataTypeDisplay = dataType ? capitalize(dataType) : '';

  const handleDataUpload = () => {
    console.log('No Data Yet :(');
  };

  return (
    <div>
      <Button onClick={handleDataUpload}>Upload {dataTypeDisplay} Data</Button>
    </div>
  );
}
