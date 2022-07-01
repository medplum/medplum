import React, { RefObject } from 'react';
import './Checkbox.css';

export interface CheckboxProps {
  name?: string;
  defaultValue?: boolean | number;
  required?: boolean;
  inputRef?: RefObject<HTMLInputElement>;
  testid?: string;
  disabled?: boolean;
  onChange?: (newValue: boolean) => void;
}

export function Checkbox(props: CheckboxProps): JSX.Element {
  const className = 'medplum-checkbox';
  return (
    <input
      id={props.name}
      name={props.name}
      className={className}
      type="checkbox"
      value="true"
      defaultChecked={!!props.defaultValue}
      required={props.required}
      ref={props.inputRef}
      data-testid={props.testid}
      disabled={props.disabled}
      onChange={(e) => {
        if (props.onChange) {
          props.onChange(e.currentTarget.checked);
        }
      }}
    />
  );
}
