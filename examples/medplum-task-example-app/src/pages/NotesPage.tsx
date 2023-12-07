import { Blockquote, Stack } from '@mantine/core';
import { Annotation, Task } from '@medplum/fhirtypes';
import { Document } from '@medplum/react';

export interface NotesPageProps {
  task: Task;
}

export function NotesPage(props: NotesPageProps): JSX.Element {
  const notes = props.task.note;

  // Sort notes so the most recent are at the top of the page
  const sortedNotes = sortNotesByTime(notes);

  // Display if the task does not have any notes
  if (!sortedNotes) {
    return (
      <div>
        <p>No Notes</p>
      </div>
    );
  }

  return (
    <Document>
      <Stack>
        {sortedNotes.map(
          (note) =>
            note.text && (
              <Blockquote
                key={`note-${note.text}`}
                cite={`${note.authorReference?.display || note.authorString} – ${note.time?.slice(0, 10)}`}
                icon={null}
              >
                {note.text}
              </Blockquote>
            )
        )}
      </Stack>
    </Document>
  );
}

function sortNotesByTime(notes: Annotation[] | undefined): Annotation[] | undefined {
  const compareTimes = (a: Annotation, b: Annotation): number => {
    const timeA = new Date(a.time || 0).getTime();
    const timeB = new Date(b.time || 0).getTime();

    return timeB - timeA;
  };

  if (!notes) {
    return undefined;
  }

  const sortedNotes = notes.sort(compareTimes);
  return sortedNotes;
}
