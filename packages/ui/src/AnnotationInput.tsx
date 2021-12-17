import { createReference } from '@medplum/core';
import { Annotation } from '@medplum/fhirtypes';
import React, { useRef, useState } from 'react';
import { useMedplumProfile } from './MedplumProvider';
import { TextField } from './TextField';

export interface AnnotationInputProps {
  name: string;
  defaultValue?: Annotation;
  onChange?: (value: Annotation) => void;
}

export function AnnotationInput(props: AnnotationInputProps) {
  const author = useMedplumProfile();
  const [value, setValue] = useState<Annotation>(props.defaultValue || {});

  const valueRef = useRef<Annotation>();
  valueRef.current = value;

  function setText(text: string): void {
    const newValue: Annotation = text ? {
      text,
      authorReference: author && createReference(author),
      time: new Date().toISOString(),
    } : {};

    setValue(newValue);
    if (props.onChange) {
      props.onChange(newValue);
    }
  }

  return (
    <TextField
      name={props.name}
      type="text"
      placeholder="Annotation text"
      defaultValue={value.text}
      onChange={e => setText(e.currentTarget.value)}
    />
  );
}
