import { Paper } from '@mantine/core';
import { Meta } from '@storybook/react';
import React from 'react';
import { DescriptionList, DescriptionListEntry } from '../DescriptionList';

export default {
  title: 'Medplum/DescriptionList',
  component: DescriptionList,
} as Meta;

export const Basic = (): JSX.Element => (
  <Paper m="xl" p="xl" shadow="xl">
    <DescriptionList>
      <DescriptionListEntry term="Term 1">Value 1</DescriptionListEntry>
      <DescriptionListEntry term="Term 2">Value 2</DescriptionListEntry>
      <DescriptionListEntry term="Term 3">Value 3</DescriptionListEntry>
    </DescriptionList>
  </Paper>
);
