import { TextInput } from '@mantine/core';
import { createReference } from '@medplum/core';
import { Annotation } from '@medplum/fhirtypes';
import { useMedplumProfile } from '@medplum/react-hooks';
import { useRef, useState } from 'react';

export interface AnnotationInputProps {
  name: string;
  defaultValue?: Annotation;
  onChange?: (value: Annotation) => void;
}

export function AnnotationInput(props: AnnotationInputProps): JSX.Element {
  const author = useMedplumProfile();
  const [value, setValue] = useState<Annotation>(props.defaultValue || {});

  const valueRef = useRef<Annotation>();
  valueRef.current = value;

  function setText(text: string): void {
    const newValue: Annotation = text
      ? {
          text,
          authorReference: author && createReference(author),
          time: new Date().toISOString(),
        }
      : {};

    setValue(newValue);
    if (props.onChange) {
      props.onChange(newValue);
    }
  }

  return (
    <TextInput
      name={props.name}
      placeholder="Annotation text"
      defaultValue={value.text}
      onChange={(e) => setText(e.currentTarget.value)}
    />
  );
}
