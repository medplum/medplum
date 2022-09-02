import { Meta } from '@storybook/react';
import * as Field from './Field';
import React from 'react';

export default {
  title: 'Medplum/Field',
  component: Field.Root,
  args: {
    editable: true,
  },
} as Meta;

const defaultProps: Field.FieldState = {
  name: 'First Name',
  value: 'Homer',
  editable: true,
  isEditing: false,
};

export const Basic = (args: any): JSX.Element => <Field.Root {...{ ...defaultProps, ...args }} />;

export const NameToTheLeft = (args: { editable: boolean }): JSX.Element => (
  <Field.Root {...{ ...defaultProps, ...args }}>
    <Field.Name />
    <span>:&nbsp;</span>
    <Field.Value />
    <Field.EditToggle />
  </Field.Root>
);

export const NameOnTop = (args: { editable: boolean }): JSX.Element => (
  <Field.Root {...{ ...defaultProps, ...args }}>
    <b>
      <Field.Name />
    </b>
    <Field.EditToggle />
    <br />
    <Field.Value />
  </Field.Root>
);

export const Table = (args: { editable: boolean }): JSX.Element => {
  const data = [
    {
      name: 'First Name',
      value: 'Homer',
    },
    {
      name: 'DOB',
      value: new Date().toLocaleDateString(),
    },
  ];

  return (
    <table>
      <thead>
        <tr>
          <th>Name</th>
          <th>Value</th>
        </tr>
      </thead>
      <tbody>
        {data.map((e, i) => (
          <tr key={i}>
            <Field.Root {...{ ...e, editable: true, isEditing: false }}>
              <td>
                <b>
                  <Field.Name />
                </b>
              </td>
              <td>
                <Field.Value />
                <Field.EditToggle />
              </td>
            </Field.Root>
          </tr>
        ))}
      </tbody>
    </table>
  );
};
