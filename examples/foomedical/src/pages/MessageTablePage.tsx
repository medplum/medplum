// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Divider, Stack, Table, Title } from '@mantine/core';
import { formatFamilyName, formatGivenName } from '@medplum/core';
import { HumanName } from '@medplum/fhirtypes';
import { Document, useSearchResources } from '@medplum/react';
import { JSX } from 'react';
import { useNavigate } from 'react-router';
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
              <Table.Tr
                key={resource.id}
                className={classes.tr}
                onClick={() => navigate(`/messages/${resource.id}`)?.catch(console.error)}
              >
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
