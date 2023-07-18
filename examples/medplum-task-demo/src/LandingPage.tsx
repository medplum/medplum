import { Anchor } from '@mantine/core';
import { Document } from '@medplum/react';
import React from 'react';
import { Link } from 'react-router-dom';

export function LandingPage(): JSX.Element {
  return (
    <Document>
      <h1>Welcome!</h1>
      <p>
        This app demonstrates how to use the Medplum SDK to work with{' '}
        <Anchor href="https://www.hl7.org/fhir/task" target="_blank">
          FHIR Tasks
        </Anchor>
        .
      </p>
      <ul>
        <li>Create a task</li>
        <li>List tasks</li>
        <li>Filter tasks</li>
        <li>Assign a task to a user</li>
        <li>Complete a task</li>
      </ul>
      <p>
        <Anchor to="/signin" component={Link}>
          Sign in
        </Anchor>
      </p>
    </Document>
  );
}
