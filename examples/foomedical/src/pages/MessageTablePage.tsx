import { Divider, Stack, Table, Title } from '@mantine/core';
import { formatGivenName, formatFamilyName } from '@medplum/core';
import { HumanName } from '@medplum/fhirtypes';
import { Document, useSearchResources } from '@medplum/react';
import { useNavigate } from 'react-router-dom';
import { Loading } from '../components/Loading';
import classes from './MessageTablePage.module.css';

export function MessageTable(): JSX.Element {
  const [practitioners] = useSearchResources('Practitioner');
  const navigate = useNavigate();

  if (!practitioners) {
    return <Loading />;
  }

  return (
    <Document width={800}>
      <Title>Chats</Title>
      <Divider my="xl" />
      <Stack gap="xl">
        <Table highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Name</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody className={classes.tableBody}>
            {practitioners.map((resource) => (
              <Table.Tr key={resource.id} className={classes.tr} onClick={() => navigate(`/messages/${resource.id}`)}>
                <Table.Td>
                  {formatGivenName(resource.name?.[0] as HumanName)} {formatFamilyName(resource.name?.[0] as HumanName)}
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Stack>
    </Document>
  );
}
