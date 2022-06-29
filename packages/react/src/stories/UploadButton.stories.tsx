import { Meta } from '@storybook/react';
import React from 'react';
import { Document } from '../Document';
import { UploadButton } from '../UploadButton';

export default {
  title: 'Medplum/UploadButton',
  component: UploadButton,
} as Meta;

export const Example = (): JSX.Element => (
  <Document>
    <UploadButton onUpload={console.log} />
  </Document>
);

export const CustomText = (): JSX.Element => (
  <Document>
    <UploadButton onUpload={console.log}>My Upload</UploadButton>
  </Document>
);
