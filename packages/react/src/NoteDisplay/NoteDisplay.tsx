import { Blockquote, Stack } from '@mantine/core';
import { Annotation } from '@medplum/fhirtypes';
import classes from './NoteDisplay.module.css';

export interface NoteDisplayProps {
  readonly value?: Annotation[];
}

export function NoteDisplay({ value }: NoteDisplayProps): JSX.Element | null {
  if (!value) {
    return null;
  }

  return (
    <Stack justify="flex-start" gap="xs">
      {value.map(
        (note) =>
          note.text && (
            <Blockquote
              key={`note-${note.text}`}
              classNames={{ cite: classes.noteCite, root: classes.noteRoot }}
              cite={note.authorReference?.display || note.authorString}
              icon={null}
            >
              {note.text}
            </Blockquote>
          )
      )}
    </Stack>
  );
}
