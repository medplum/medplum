import { ExampleThreadHeader } from '@medplum/mock';
import { Meta } from '@storybook/react';
import { Document } from '../../Document/Document';
import { withMockedDate } from '../../stories/decorators';
import { ThreadChat } from './ThreadChat';

export default {
  title: 'Medplum/Chat/ThreadChat',
  component: ThreadChat,
  decorators: [withMockedDate],
} as Meta;

export const Basic = (): JSX.Element => {
  return (
    <Document>
      <div style={{ width: 360, height: 400, margin: '0 auto' }}>
        <ThreadChat thread={ExampleThreadHeader} />
      </div>
    </Document>
  );
};

export const OverrideTitle = (): JSX.Element => {
  return (
    <Document>
      <div style={{ width: 360, height: 400, margin: '0 auto' }}>
        <ThreadChat title="Chat with Homer Simpson" thread={ExampleThreadHeader} />
      </div>
    </Document>
  );
};

export const InputDisabled = (): JSX.Element => {
  return (
    <Document>
      <div style={{ width: 360, height: 400, margin: '0 auto' }}>
        <ThreadChat thread={ExampleThreadHeader} inputDisabled />
      </div>
    </Document>
  );
};
