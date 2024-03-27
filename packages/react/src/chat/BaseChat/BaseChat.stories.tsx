import { createReference, getReferenceString } from '@medplum/core';
import { DrAliceSmith, HomerSimpson } from '@medplum/mock';
import { Meta } from '@storybook/react';
import { Document } from '../../Document/Document';
import { withMockedDate } from '../../stories/decorators';
import { BaseChat } from './BaseChat';

export default {
  title: 'Medplum/Chat/BaseChat',
  component: BaseChat,
  decorators: [withMockedDate],
} as Meta;

export const Basic = (): JSX.Element => {
  const sent1 = new Date();
  const received1 = new Date(sent1);
  received1.setMilliseconds(sent1.getMilliseconds() + 100);
  const sent2 = new Date(sent1);
  sent2.setSeconds(sent1.getSeconds() + 1);
  const received2 = new Date(sent2);
  received2.setMilliseconds(sent2.getMilliseconds() + 100);

  return (
    <Document>
      <div style={{ width: 360, height: 400, margin: '0 auto' }}>
        <BaseChat
          title="Chat with Homer Simpson"
          query={`sender=${getReferenceString(HomerSimpson)},${getReferenceString(DrAliceSmith)}&recipient=${getReferenceString(HomerSimpson)},${getReferenceString(DrAliceSmith)}`}
          communications={[
            {
              id: 'message-1',
              resourceType: 'Communication',
              sender: createReference(DrAliceSmith),
              recipient: [createReference(HomerSimpson)],
              status: 'completed',
              payload: [
                { contentString: 'Hi, Homer. Can you come in to discuss treatment for your radiation poisoning?' },
              ],
              sent: sent1.toISOString(),
            },
            {
              id: 'message-2',
              resourceType: 'Communication',
              sender: createReference(HomerSimpson),
              recipient: [createReference(DrAliceSmith)],
              status: 'completed',
              payload: [{ contentString: 'Aww, not again... Doh!' }],
              sent: sent2.toISOString(),
            },
          ]}
          setCommunications={() => undefined}
          sendMessage={() => undefined}
        />
      </div>
    </Document>
  );
};

export const DeliveredTimestamps = (): JSX.Element => {
  const sent1 = new Date();
  const received1 = new Date(sent1);
  received1.setMilliseconds(sent1.getMilliseconds() + 100);
  const sent2 = new Date(sent1);
  sent2.setSeconds(sent1.getSeconds() + 1);
  const received2 = new Date(sent2);
  received2.setMilliseconds(sent2.getMilliseconds() + 100);

  return (
    <Document>
      <div style={{ width: 360, height: 400, margin: '0 auto' }}>
        <BaseChat
          title="Chat with Homer Simpson"
          query={`sender=${getReferenceString(HomerSimpson)},${getReferenceString(DrAliceSmith)}&recipient=${getReferenceString(HomerSimpson)},${getReferenceString(DrAliceSmith)}`}
          communications={[
            {
              id: 'message-1',
              resourceType: 'Communication',
              sender: createReference(DrAliceSmith),
              recipient: [createReference(HomerSimpson)],
              status: 'completed',
              payload: [
                { contentString: 'Hi, Homer. Can you come in to discuss treatment for your radiation poisoning?' },
              ],
              sent: sent1.toISOString(),
              received: received1.toISOString(),
            },
            {
              id: 'message-2',
              resourceType: 'Communication',
              sender: createReference(HomerSimpson),
              recipient: [createReference(DrAliceSmith)],
              status: 'completed',
              payload: [{ contentString: 'Aww, not again... Doh!' }],
              sent: sent2.toISOString(),
              received: received2.toISOString(),
            },
          ]}
          setCommunications={() => undefined}
          sendMessage={() => undefined}
        />
      </div>
    </Document>
  );
};

export const ChatScrolls = (): JSX.Element => {
  const sent1 = new Date();
  const sent2 = new Date(sent1);
  sent2.setSeconds(sent1.getSeconds() + 1);
  const sent3 = new Date(sent2);
  sent3.setSeconds(sent2.getSeconds() + 1);
  const sent4 = new Date(sent3);
  sent4.setSeconds(sent3.getSeconds() + 1);
  const sent5 = new Date(sent4);
  sent5.setSeconds(sent4.getSeconds() + 1);
  const sent6 = new Date(sent5);
  sent6.setSeconds(sent5.getSeconds() + 1);
  return (
    <Document>
      <div style={{ width: 360, height: 400, margin: '0 auto' }}>
        <BaseChat
          title="Chat with Homer Simpson"
          query={`sender=${getReferenceString(HomerSimpson)},${getReferenceString(DrAliceSmith)}&recipient=${getReferenceString(HomerSimpson)},${getReferenceString(DrAliceSmith)}`}
          communications={[
            {
              id: 'message-1',
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
              id: 'message-2',
              resourceType: 'Communication',
              sender: createReference(HomerSimpson),
              recipient: [createReference(DrAliceSmith)],
              status: 'in-progress',
              payload: [{ contentString: 'Aww, not again... Doh!' }],
              sent: sent2.toISOString(),
            },
            {
              id: 'message-3',
              resourceType: 'Communication',
              sender: createReference(DrAliceSmith),
              recipient: [createReference(HomerSimpson)],
              status: 'in-progress',
              payload: [{ contentString: "Homer, I haven't received your labs yet. Did you go for your lab work?" }],
              sent: sent3.toISOString(),
            },
            {
              id: 'message-4',
              resourceType: 'Communication',
              sender: createReference(HomerSimpson),
              recipient: [createReference(DrAliceSmith)],
              status: 'in-progress',
              payload: [{ contentString: 'Of course I did! Must be in the mail' }],
              sent: sent4.toISOString(),
            },
            {
              id: 'message-5',
              resourceType: 'Communication',
              sender: createReference(DrAliceSmith),
              recipient: [createReference(HomerSimpson)],
              status: 'in-progress',
              payload: [{ contentString: 'Homer, this is for your own wellbeing. You need to take this seriously.' }],
              sent: sent1.toISOString(),
            },
            {
              id: 'message-6',
              resourceType: 'Communication',
              sender: createReference(HomerSimpson),
              recipient: [createReference(DrAliceSmith)],
              status: 'in-progress',
              payload: [{ contentString: "Well I stopped eating donuts didn't I? Sometimes..." }],
              sent: sent2.toISOString(),
            },
          ]}
          setCommunications={() => undefined}
          sendMessage={() => undefined}
        />
      </div>
    </Document>
  );
};

export const InputDisabled = (): JSX.Element => {
  const sent1 = new Date();
  const received1 = new Date(sent1);
  received1.setMilliseconds(sent1.getMilliseconds() + 100);
  const sent2 = new Date(sent1);
  sent2.setSeconds(sent1.getSeconds() + 1);
  const received2 = new Date(sent2);
  received2.setMilliseconds(sent2.getMilliseconds() + 100);

  return (
    <Document>
      <div style={{ width: 360, height: 400, margin: '0 auto' }}>
        <BaseChat
          title="Chat with Homer Simpson"
          query={`sender=${getReferenceString(HomerSimpson)},${getReferenceString(DrAliceSmith)}&recipient=${getReferenceString(HomerSimpson)},${getReferenceString(DrAliceSmith)}`}
          communications={[
            {
              id: 'message-1',
              resourceType: 'Communication',
              sender: createReference(DrAliceSmith),
              recipient: [createReference(HomerSimpson)],
              status: 'completed',
              payload: [
                { contentString: 'Hi, Homer. Can you come in to discuss treatment for your radiation poisoning?' },
              ],
              sent: sent1.toISOString(),
              received: received1.toISOString(),
            },
            {
              id: 'message-2',
              resourceType: 'Communication',
              sender: createReference(HomerSimpson),
              recipient: [createReference(DrAliceSmith)],
              status: 'completed',
              payload: [{ contentString: 'Aww, not again... Doh!' }],
              sent: sent2.toISOString(),
              received: received2.toISOString(),
            },
          ]}
          setCommunications={() => undefined}
          sendMessage={() => undefined}
          inputDisabled
        />
      </div>
    </Document>
  );
};
