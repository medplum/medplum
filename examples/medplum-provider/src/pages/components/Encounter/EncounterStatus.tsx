import React from 'react';
import { Badge } from '@mantine/core';
import { Encounter } from '@medplum/fhirtypes';
import classes from './EncounterStatus.module.css';
import cx from 'clsx';

interface EncounterStatusProps {
  encounter: Encounter;
}

const getStatusClass = (status: string): string => {
  console.log('status:', status);
  switch (status) {
    case 'arrived':
    case 'in-progress':
      console.log('classes.green:', classes.green);
      return classes.green;
    case 'finished':
      return classes.blue;
    default:
      return classes.gray;
  }
};

export const EncounterStatus = ({ encounter }: EncounterStatusProps): JSX.Element => {
  return (
    <Badge className={cx(classes.badge, getStatusClass(encounter.status))} radius="xl">
      {encounter.status.replace(/-/g, ' ')}
    </Badge>
  );
};
