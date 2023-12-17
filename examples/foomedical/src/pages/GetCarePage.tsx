import { Schedule } from '@medplum/fhirtypes';
import { Document, Scheduler, useMedplum } from '@medplum/react';

export function GetCare(): JSX.Element {
  const medplum = useMedplum();
  const schedule = medplum.searchOne('Schedule').read();

  return (
    <Document width={800}>
      <Scheduler
        schedule={schedule as Schedule}
        questionnaire={{
          resourceType: 'Questionnaire',
          status: 'active',
          name: 'Test',
          item: [
            {
              id: 'id-1',
              linkId: 'q1',
              type: 'string',
              text: 'Question 1',
            },
            {
              id: 'id-2',
              linkId: 'q2',
              type: 'string',
              text: 'Question 2',
            },
            {
              id: 'id-3',
              linkId: 'q3',
              type: 'string',
              text: 'Question 3',
            },
          ],
        }}
      />
    </Document>
  );
}
