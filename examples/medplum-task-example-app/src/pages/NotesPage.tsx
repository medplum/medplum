import { Blockquote, Stack } from '@mantine/core';
import { Annotation, Resource, ResourceType, Task } from '@medplum/fhirtypes';
import { Document, Loading, useMedplum, useResource } from '@medplum/react';

export interface NotesPageProps {
  task: Task;
}

export function NotesPage(props: NotesPageProps): JSX.Element {
  const task = props.task;

  // Display if the task does not have any notes
  if (!task?.note) {
    return (
      <div>
        <p>No Notes</p>
      </div>
    );
  }

  return (
    <Document>
      <Stack>
        {task.note.map(
          (note) =>
            note.text && (
              <Blockquote
                key={`note-${note.text}`}
                cite={note.authorReference?.display || note.authorString}
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
