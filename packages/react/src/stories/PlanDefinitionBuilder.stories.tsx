import { Meta } from '@storybook/react';
import React, { useEffect, useState } from 'react';
import { Document } from '../Document';
import { PlanDefinitionBuilder } from '../PlanDefinitionBuilder';
import { useMedplum } from '../MedplumProvider';
import {
  Covid19AssessmentQuestionnaire,
  Covid19CarePlanDefinition,
  Covid19PCRServiceRequest,
  Covid19RequestGroup,
  Covid19ReviewReport,
  Covid19AssessmentTask,
  Covid19PCRTask,
  Covid19PCRTest,
  Covid19FollowUpConsultTask,
  Covid19InitialConsultTask,
  Covid19ReviewLabsTask,
} from './covid19';

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
  const medplum = useMedplum();
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    (async (): Promise<boolean> => {
      await medplum.createResource(Covid19AssessmentQuestionnaire);
      await medplum.createResource(Covid19CarePlanDefinition);
      await medplum.createResource(Covid19PCRServiceRequest);
      await medplum.createResource(Covid19RequestGroup);
      await medplum.createResource(Covid19ReviewReport);
      await medplum.createResource(Covid19AssessmentTask);
      await medplum.createResource(Covid19PCRTask);
      await medplum.createResource(Covid19PCRTest);
      await medplum.createResource(Covid19FollowUpConsultTask);
      await medplum.createResource(Covid19InitialConsultTask);
      await medplum.createResource(Covid19ReviewLabsTask);
      return true;
    })()
      .then(setLoaded)
      .catch(console.log);
  }, [medplum]);

  if (!loaded) {
    return <></>;
  }

  return (
    <PlanDefinitionBuilder
      value={Covid19CarePlanDefinition}
      onSubmit={(formData: any) => {
        console.log(JSON.stringify(formData, null, 2));
      }}
    />
  );
};
