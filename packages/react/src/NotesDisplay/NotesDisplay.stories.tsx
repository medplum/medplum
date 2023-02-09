import { Meta } from '@storybook/react';
import React from 'react';
import { Document } from '../Document/Document';
import { CreatinineObservation } from '../stories/referenceLab';
import { NotesDisplay } from './NotesDisplay';
export default {
  title: 'Medplum/NotesDisplay',
  component: NotesDisplay,
} as Meta;

export const Simple = (): JSX.Element => (
  <Document>
    <NotesDisplay value={CreatinineObservation.note?.slice(1)} />
  </Document>
);

export const WithAuthor = (): JSX.Element => (
  <Document>
    <NotesDisplay value={CreatinineObservation.note?.slice(0, 1)} />
  </Document>
);

export const MultipleNotes = (): JSX.Element => (
  <Document>
    <NotesDisplay value={CreatinineObservation.note} />
  </Document>
);
