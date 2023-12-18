import { Button, Modal } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { createReference, getQuestionnaireAnswers, MedplumClient } from '@medplum/core';
import { Annotation, QuestionnaireResponse, Task } from '@medplum/fhirtypes';
import { QuestionnaireForm, useMedplum } from '@medplum/react';
import { useState } from 'react';
import { commentQuestionnaire } from './questionnaires';

interface AddCommentProps {
  task: Task;
  onChange: (updatedTask: Task) => void;
}

export function AddComment(props: AddCommentProps): JSX.Element {
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const medplum = useMedplum();
  const author = medplum.getProfile();

  const handleOpenClose = (): void => {
    setIsOpen(!isOpen);
  };

  const handleAddComment = async (
    comment: Annotation,
    task: Task,
    medplum: MedplumClient,
    onChange: (task: Task) => void
  ) => {
    let taskNotes = task?.note;
    if (taskNotes) {
      // If there are already notes, push on to the array
      taskNotes.push(comment);
    } else {
      // Otherwise, create an array with the first comment
      taskNotes = [comment];
    }

    if (!task) {
      return;
    }

    // Create an updated task with the new note. See https://www.medplum.com/docs/careplans/tasks#task-comments
    const updatedTask = {
      ...task,
      note: taskNotes,
    };

    // Update the resource on the server and re-render the task page
    await medplum.updateResource(updatedTask).catch((error) =>
      notifications.show({
        title: 'Error',
        message: `Error: ${error}`,
      })
    );
    notifications.show({
      title: 'Success',
      message: 'Comment added',
    });
    onChange(updatedTask);
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
      handleAddComment(newNote, props.task, medplum, props.onChange);
    }

    // Close the modal
    handleOpenClose();
  };

  return (
    <div>
      <Button fullWidth onClick={handleOpenClose}>
        Add a Comment
      </Button>
      <Modal opened={isOpen} onClose={handleOpenClose}>
        <QuestionnaireForm questionnaire={commentQuestionnaire} onSubmit={onQuestionnaireSubmit} />
      </Modal>
    </div>
  );
}
