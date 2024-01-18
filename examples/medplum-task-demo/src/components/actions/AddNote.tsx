import { Button, Modal } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  createReference,
  getQuestionnaireAnswers,
  MedplumClient,
  normalizeErrorString,
  PatchOperation,
} from '@medplum/core';
import { Annotation, Questionnaire, QuestionnaireResponse, Task } from '@medplum/fhirtypes';
import { QuestionnaireForm, useMedplum, useMedplumProfile } from '@medplum/react';
import { IconCircleCheck, IconCircleOff } from '@tabler/icons-react';
import { useState } from 'react';

interface AddCommentProps {
  task: Task;
  onChange: (updatedTask: Task) => void;
}

export function AddNote(props: AddCommentProps): JSX.Element {
  const medplum = useMedplum();
  const author = useMedplumProfile();
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);

  const handleOpenClose = (): void => {
    setIsModalOpen(!isModalOpen);
  };

  const handleAddComment = async (
    comment: Annotation,
    task: Task,
    medplum: MedplumClient,
    onChange: (task: Task) => void
  ): Promise<void> => {
    if (!task?.id) {
      return;
    }

    // We use a patch operation here to avoid race conditions. This ensures that if multiple users try to add a note simultaneously, only one will be successful.
    const ops: PatchOperation[] = [{ op: 'test', path: '/meta/versionId', value: task.meta?.versionId }];

    // Get the task notes if they exist and add the new note to the list. See https://www.medplum.com/docs/careplans/tasks#task-comments
    const taskNotes = task?.note || [];
    taskNotes.push(comment);

    const op: PatchOperation['op'] = task.note ? 'replace' : 'add';

    ops.push({ op, path: '/note', value: taskNotes });

    // Update the resource on the server using a patch request. See https://www.medplum.com/docs/sdk/core.medplumclient.patchresource
    try {
      const result = await medplum.patchResource('Task', task.id, ops);
      notifications.show({
        icon: <IconCircleCheck />,
        title: 'Success',
        message: 'Comment added.',
      });
      onChange(result);
    } catch (error) {
      notifications.show({
        color: 'red',
        icon: <IconCircleOff />,
        title: 'Error',
        message: normalizeErrorString(error),
      });
    }
  };

  const onQuestionnaireSubmit = (formData: QuestionnaireResponse): void => {
    const answer = getQuestionnaireAnswers(formData)['new-comment'].valueString;

    // Create a new note
    if (answer) {
      const newNote: Annotation = {
        text: answer,
        authorReference: author && createReference(author),
        time: new Date().toISOString(),
      };

      // Add the note to the task
      handleAddComment(newNote, props.task, medplum, props.onChange).catch((error) => console.error(error));
    }

    // Close the modal
    setIsModalOpen(false);
  };

  return (
    <div>
      <Button fullWidth onClick={handleOpenClose}>
        Add a Note
      </Button>
      <Modal opened={isModalOpen} onClose={handleOpenClose}>
        <QuestionnaireForm questionnaire={commentQuestionnaire} onSubmit={onQuestionnaireSubmit} />
      </Modal>
    </div>
  );
}

const commentQuestionnaire: Questionnaire = {
  resourceType: 'Questionnaire',
  status: 'active',
  id: 'add-comment',
  title: 'Add a comment',
  item: [
    {
      linkId: 'new-comment',
      text: 'Add a comment',
      type: 'string',
    },
  ],
};
