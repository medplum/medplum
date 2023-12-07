import { Button, Modal } from '@mantine/core';
import { createReference } from '@medplum/core';
import { Annotation, Task } from '@medplum/fhirtypes';
import { AnnotationInput, Form, FormSection, QuestionnaireForm, useMedplumProfile } from '@medplum/react';
import { profile } from 'console';
import { SetStateAction, useState } from 'react';

interface AddTaskCommentProps {
  task: Task;
  onAddComment: (comment: Annotation) => void;
  isOpen: boolean;
  onClose: () => void;
}

export function AddTaskComment(props: AddTaskCommentProps): JSX.Element {
  const author = useMedplumProfile();
  const [comment, setComment] = useState<Annotation>({});

  const handleCommentChange = (newComment: Annotation) => {
    setComment(newComment);
  };

  const handleSubmit = () => {
    if (comment?.text) {
      const newComment: Annotation = {
        ...comment,
        authorReference: author && createReference(author),
      };

      props.onAddComment(newComment);
      props.onClose();
    }
  };

  const onQuestionnaireSubmit = (formData: any) => {
    console.log(formData);
    props.onClose();
  };

  return (
    <Modal onSubmit={handleSubmit} opened={props.isOpen} onClose={props.onClose}>
      <QuestionnaireForm
        questionnaire={{
          resourceType: 'Questionnaire',
          id: 'comment-questionnaire',
          title: 'Add a comment',
          item: [
            {
              linkId: 'new-comment',
              text: 'Add a Comment',
              type: 'string',
            },
          ],
        }}
        onSubmit={onQuestionnaireSubmit}
      />

      {/* <FormSection>
        <AnnotationInput name="task-comment" onChange={handleCommentChange} />
      </FormSection>
      <Button type="submit">Submit</Button> */}
    </Modal>
  );
}
