import { createReference, getReferenceString } from '@medplum/core';
import { DrAliceSmith, HomerSimpson } from '@medplum/mock';
import { Meta } from '@storybook/react';
import { Document } from '../Document/Document';
import { withMockedDate } from '../stories/decorators';
import { BaseChat } from './BaseChat';

export default {
  title: 'Medplum/BaseChat',
  component: BaseChat,
  decorators: [withMockedDate],
} as Meta;

export const Basic = (): JSX.Element => {
  const sent1 = new Date();
  const sent2 = new Date(sent1);
  sent2.setSeconds(sent1.getSeconds() + 1);
  return (
    <Document>
      <BaseChat
        title={'Chat with Homer Simpson'}
        query={`sender=${getReferenceString(HomerSimpson)},${getReferenceString(DrAliceSmith)}&recipient=${getReferenceString(HomerSimpson)},${getReferenceString(DrAliceSmith)}`}
        communications={[
          {
            resourceType: 'Communication',
            sender: createReference(DrAliceSmith),
            recipient: [createReference(HomerSimpson)],
            status: 'in-progress',
            payload: [
              { contentString: 'Hi, Homer. Can you come in to discuss treatment for your radiation poisoning?' },
            ],
            sent: sent1.toISOString(),
          },
          {
            resourceType: 'Communication',
            sender: createReference(HomerSimpson),
            recipient: [createReference(DrAliceSmith)],
            status: 'in-progress',
            payload: [{ contentString: 'Aww, not again... Doh!' }],
            sent: sent2.toISOString(),
          },
        ]}
        setCommunications={() => undefined}
        sendMessage={() => undefined}
        open={true}
      />
    </Document>
  );
};
