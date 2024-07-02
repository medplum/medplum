import { Divider, Stack, Table, Title } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { formatGivenName, formatFamilyName, normalizeErrorString } from '@medplum/core';
import { Patient, Practitioner, HumanName } from '@medplum/fhirtypes';
import { Document, useMedplum, useMedplumProfile } from '@medplum/react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loading } from '../components/Loading';
import classes from './MessageTablePage.module.css';
import { IconCircleOff } from '@tabler/icons-react';

export function MessageTable(): JSX.Element {
  const medplum = useMedplum();
  const profile = useMedplumProfile() as Patient;
  const navigate = useNavigate();
  const [practitioners, setPractitioners] = useState<Practitioner[]>();

  useEffect(() => {
    medplum
      .graphql(
        `
        {
          PractitionerList {
            id
            name {
              given
              family
            }
          }
        }
      `
      )
      .then((value) => setPractitioners(value.data.PractitionerList as Practitioner[]))
      .catch((err) => {
        showNotification({
          color: 'red',
          icon: <IconCircleOff />,
          title: 'Error',
          message: normalizeErrorString(err),
        });
      });
  }, [medplum, profile]);

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
