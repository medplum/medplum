import { Meta } from '@storybook/react';
import React from 'react';
import { Document } from '../Document';
import { PlanDefinitionBuilder } from '../PlanDefinitionBuilder';
import { Covid19CarePlanDefinition } from '@medplum/mock';

export default {
  title: 'Medplum/PlanDefinitionBuilder',
  component: PlanDefinitionBuilder,
} as Meta;

export const Basic = (): JSX.Element => (
  <Document>
    <PlanDefinitionBuilder
      value={{
        resourceType: 'PlanDefinition',
        title: 'Basic Example',
      }}
      onSubmit={(formData: any) => {
        console.log(JSON.stringify(formData, null, 2));
      }}
    />
  </Document>
);

export const Covid19Eval = (): JSX.Element => {
  return (
    <PlanDefinitionBuilder
      value={Covid19CarePlanDefinition}
      onSubmit={(formData: any) => {
        console.log(JSON.stringify(formData, null, 2));
      }}
    />
  );
};
