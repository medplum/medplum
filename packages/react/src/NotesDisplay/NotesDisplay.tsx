import { Blockquote, createStyles, Stack } from '@mantine/core';
import { Annotation } from '@medplum/fhirtypes';
import React from 'react';

interface NotesDisplayProps {
  value?: Annotation[];
}

const useStyles = createStyles((theme) => ({
  table: {
    border: `0.1px solid ${theme.colors.gray[5]}`,
    borderCollapse: 'collapse',

    '& td, & th': {
      border: `0.1px solid ${theme.colors.gray[5]}`,
      padding: 4,
    },
  },

  criticalRow: {
    background: theme.colorScheme === 'dark' ? theme.colors.red[7] : theme.colors.red[1],
    border: `0.1px solid ${theme.colors.red[5]}`,
    color: theme.colors.red[5],
    fontWeight: 500,

    '& td': {
      border: `0.1px solid ${theme.colors.red[5]}`,
    },
  },

  noteBody: { fontSize: theme.fontSizes.sm },
  noteCite: { fontSize: theme.fontSizes.xs, marginBlockStart: 3 },
  noteRoot: { padding: 5 },
}));

export function NotesDisplay({ value }: NotesDisplayProps): JSX.Element | null {
  const { classes } = useStyles();
  if (!value) {
    return null;
  }

  return (
    <Stack justify={'flex-start'} spacing="xs">
      {value.map(
        (note) =>
          note.text && (
            <Blockquote
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
