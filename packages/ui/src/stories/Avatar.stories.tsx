import { Meta } from '@storybook/react';
import React from 'react';
import { Avatar } from '../Avatar';
import { Document } from '../Document';

export default {
  title: 'Medplum/Avatar',
  component: Avatar,
} as Meta;

export const Image = () => (
  <Document>
    <div style={{ display: 'flex', width: 168, justifyContent: 'space-between' }}>
      <Avatar alt="George Washington" src="/avatars/1.jpg" />
      <Avatar alt="Mona Lisa" src="/avatars/2.jpg" />
      <Avatar alt="Elmo" src="/avatars/3.jpg" />
    </div>
  </Document>
);

export const Letter = () => (
  <Document>
    <div style={{ display: 'flex', width: 168, justifyContent: 'space-between' }}>
      <Avatar alt="George Wasington" />
      <Avatar alt="Mona Lisa" color="var(--medplum-blue-500)" />
      <Avatar alt="Elmo" color="var(--medplum-purple-500)" />
    </div>
  </Document>
);

export const Sizes = () => (
  <Document>
    <div style={{ display: 'flex', width: 168, justifyContent: 'space-between' }}>
      <Avatar alt="Mona Lisa" src="/avatars/2.jpg" size="small" />
      <Avatar alt="Mona Lisa" src="/avatars/2.jpg" />
      <Avatar alt="Mona Lisa" src="/avatars/2.jpg" size="large" />
    </div>
  </Document>
);

export const LetterSizes = () => (
  <Document>
    <div style={{ display: 'flex', width: 168, justifyContent: 'space-between' }}>
      <Avatar alt="George Wasington" size="small" />
      <Avatar alt="George Wasington" color="var(--medplum-blue-500)" />
      <Avatar alt="George Wasington" color="var(--medplum-purple-500)" size="large" />
    </div>
  </Document>
);

export const Resource = () => (
  <Document>
    <Avatar reference={{ reference: 'Patient/' + process.env.SAMPLE_PATIENT_ID }} />
  </Document>
);

export const WithText = () => (
  <Document>
    <a href="#">
      <div style={{ display: 'flex', width: 180, justifyContent: 'space-between' }}>
        <Avatar alt="George Washington" src="/avatars/1.jpg" />
        George Washington
      </div>
    </a>
    <hr style={{ margin: '40px 0' }} />
    <a href="#">
      <div style={{ display: 'flex', width: 180, justifyContent: 'space-between' }}>
        <Avatar alt="George Washington" src="/avatars/1.jpg" />
        George Washington<br />View profile
      </div>
    </a>
  </Document>
);
