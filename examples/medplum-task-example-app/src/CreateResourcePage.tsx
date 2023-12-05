import { Paper, Text } from '@mantine/core';
import { Resource } from '@medplum/fhirtypes';
import { ResourceForm, useMedplum } from '@medplum/react';
import { useNavigate, useParams } from 'react-router-dom';

export function CreateResourcePage(): JSX.Element {
  const navigate = useNavigate();
  const medplum = useMedplum();
  const { resourceType } = useParams();
  console.log(medplum);

  const defaultResource = { resourceType } as Resource;

  const handleSubmit = (newResource: Resource) => {
    medplum
      .createResource(newResource)
      .then((result) => navigate(`/${resourceType}/${result.id}`))
      .catch((error) => console.error(error));
  };

  return (
    <div>
      <Paper>
        <Text>New {resourceType}</Text>
        <div>
          <ResourceForm defaultValue={defaultResource} onSubmit={handleSubmit}></ResourceForm>
        </div>
      </Paper>
    </div>
  );
}
