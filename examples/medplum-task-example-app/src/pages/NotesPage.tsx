import { Blockquote, Stack } from '@mantine/core';
import { Annotation, Resource, ResourceType, Task } from '@medplum/fhirtypes';
import { Document, Loading, useMedplum } from '@medplum/react';
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

export interface NotesPageProps {
  task: Task;
}

export function NotesPage(props: NotesPageProps): JSX.Element {
  const medplum = useMedplum();
  const { resourceType, id } = useParams() as { resourceType: ResourceType; id: string };
  const [task, setTask] = useState<Resource | undefined>(undefined);

  useEffect(() => {
    if (resourceType && id) {
      medplum.readResource(resourceType, id).then(setTask);
    }
  }, [medplum]);

  if (!props.task.note) {
    return (
      <div>
        <p>No Notes</p>
      </div>
    );
  }

  return (
    <Document>
      <Stack>
        {props.task.note.map(
          (note) =>
            note.text && (
              <Blockquote key={`note-${note.text}`} cite={note.authorReference?.display || note.authorString} />
            )
        )}
      </Stack>
    </Document>
  );
}
