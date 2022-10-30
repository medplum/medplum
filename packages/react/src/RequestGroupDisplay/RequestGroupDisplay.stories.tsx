import { ExampleWorkflowRequestGroup } from '@medplum/mock';
import { Meta } from '@storybook/react';
import React, { useEffect, useState } from 'react';
import { Document } from '../Document/Document';
import { useMedplum } from '../MedplumProvider/MedplumProvider';
import {
  Covid19AssessmentTask,
  Covid19FollowUpConsultTask,
  Covid19InitialConsultTask,
  Covid19PCRTask,
  Covid19PCRTest,
  Covid19RequestGroup,
  Covid19ReviewLabsTask,
} from '../stories/covid19';
import { RequestGroupDisplay } from './RequestGroupDisplay';

export default {
  title: 'Medplum/RequestGroupDisplay',
  component: RequestGroupDisplay,
} as Meta;

export const Simple = (): JSX.Element => (
  <Document>
    <RequestGroupDisplay onStart={console.log} onEdit={console.log} value={ExampleWorkflowRequestGroup} />
  </Document>
);

export const Covid19 = (): JSX.Element => {
  const medplum = useMedplum();
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    (async (): Promise<boolean> => {
      await medplum.createResource(Covid19RequestGroup);
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
    <Document>
      <RequestGroupDisplay onStart={console.log} onEdit={console.log} value={Covid19RequestGroup} />
    </Document>
  );
};
