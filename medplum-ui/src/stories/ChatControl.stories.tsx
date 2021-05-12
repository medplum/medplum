import { Meta } from '@storybook/react';
import React from 'react';
import { ChatControl, ChatControlProps } from '../ChatControl';
import { Document } from '../Document';

export default {
  title: 'Medplum/ChatControl',
  component: ChatControl,
} as Meta;

export const Basic = (args: ChatControlProps) => (
  <Document>
    <ChatControl criteria="Communication" {...args} />
  </Document>
);
