import { Meta } from '@storybook/react';
import { Document } from '../Document/Document';
import { CreatinineObservation } from '../stories/referenceLab';
import { NoteDisplay } from './NoteDisplay';
export default {
  title: 'Medplum/NotesDisplay',
  component: NoteDisplay,
} as Meta;

export const Simple = (): JSX.Element => (
  <Document>
    <NoteDisplay value={CreatinineObservation.note?.slice(1)} />
  </Document>
);

export const WithAuthor = (): JSX.Element => (
  <Document>
    <NoteDisplay value={CreatinineObservation.note?.slice(0, 1)} />
  </Document>
);

export const MultipleNotes = (): JSX.Element => (
  <Document>
    <NoteDisplay value={CreatinineObservation.note} />
  </Document>
);
