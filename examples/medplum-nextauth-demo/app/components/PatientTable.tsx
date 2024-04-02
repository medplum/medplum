'use client';

import React from 'react';
import { Bundle, Patient } from '@medplum/fhirtypes';
import { Table } from '@mantine/core';

type PatientTableProps = {
  patients: Bundle<Patient>;
};

export const PatientTable: React.FC<PatientTableProps> = ({ patients }) => {
  const rows = patients.entry?.map((item): any => (
    <Table.Tr key={item.resource?.id}>
      <Table.Td>{item.resource?.id}</Table.Td>
      <Table.Td>{item.resource?.name?.[0].given?.[0]}</Table.Td>
      <Table.Td>{item.resource?.name?.[0].family}</Table.Td>
    </Table.Tr>
  ));

  return (
    <Table>
      <Table.Thead>
        <Table.Tr>
          <Table.Th>ID</Table.Th>
          <Table.Th>Name</Table.Th>
          <Table.Th>Family</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>{rows}</Table.Tbody>
    </Table>
  );
};
