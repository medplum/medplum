import { Button } from '@mantine/core';
import { createReference, MedplumClient, protectedResourceTypes } from '@medplum/core';
import { Annotation, Task } from '@medplum/fhirtypes';
import { AnnotationInput, Form, FormSection, useMedplumProfile } from '@medplum/react';
import { profile } from 'console';
import { SetStateAction, useState } from 'react';

interface AddTaskCommentProps {
  task: Task;
  onAddComment: (comment: Annotation) => void;
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
      setComment({});
    }
  };

  return (
    <Form onSubmit={handleSubmit}>
      <FormSection>
        <AnnotationInput name="task-comment" onChange={handleCommentChange} />
      </FormSection>
      <Button type="submit">Submit</Button>
    </Form>
  );
}
