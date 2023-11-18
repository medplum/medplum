import { Blockquote, createStyles, Stack } from '@mantine/core';
import { Annotation } from '@medplum/fhirtypes';

const useStyles = createStyles((theme) => ({
  noteBody: { fontSize: theme.fontSizes.sm },
  noteCite: { fontSize: theme.fontSizes.xs, marginBlockStart: 3 },
  noteRoot: { padding: 5 },
}));

export interface NoteDisplayProps {
  value?: Annotation[];
}

export function NoteDisplay({ value }: NoteDisplayProps): JSX.Element | null {
  const { classes } = useStyles();
  if (!value) {
    return null;
  }

  return (
    <Stack justify="flex-start" spacing="xs">
      {value.map(
        (note) =>
          note.text && (
            <Blockquote
              key={`note-${note.text}`}
              classNames={{ cite: classes.noteCite, body: classes.noteBody, root: classes.noteRoot }}
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
