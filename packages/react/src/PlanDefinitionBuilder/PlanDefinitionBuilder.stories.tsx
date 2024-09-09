import { useMedplum } from '@medplum/react-hooks';
import { Meta } from '@storybook/react';
import { useEffect, useState } from 'react';
import { Document } from '../Document/Document';
import {
  Covid19AssessmentQuestionnaire,
  Covid19CarePlanDefinition,
  Covid19PCRLabService,
  Covid19PCRServiceRequest,
  Covid19PCRTest,
  Covid19ReviewReport,
} from '../stories/covid19';
import { PlanDefinitionBuilder } from './PlanDefinitionBuilder';

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

      await medplum.createResource(Covid19ReviewReport);
      await medplum.createResource(Covid19PCRTest);
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

export const Covid19PCRLabServiceStory = (): JSX.Element => {
  const medplum = useMedplum();
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    (async (): Promise<boolean> => {
      await medplum.createResource(Covid19PCRLabService);

      await medplum.createResource(Covid19ReviewReport);

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
      value={Covid19PCRLabService}
      onSubmit={(formData: any) => {
        console.log(JSON.stringify(formData, null, 2));
      }}
    />
  );
};
