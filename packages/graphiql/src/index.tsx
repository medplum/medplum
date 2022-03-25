import { MedplumClient } from '@medplum/core';
import { MedplumProvider, SignInForm, useMedplumProfile } from '@medplum/ui';
import GraphiQL from 'graphiql';
import React from 'react';
import { render } from 'react-dom';
import 'regenerator-runtime/runtime.js';
import '@medplum/ui/defaulttheme.css';
import '@medplum/ui/styles.css';
import 'graphiql/graphiql.css';

const HELP_TEXT = `# Welcome to Medplum GraphiQL
#
# Medplum is a healthcare platform that helps you quickly develop
# high-quality compliant applications. Medplum includes a FHIR server,
# React component library, and developer console.
#
# Type queries into this side of the screen, and you will see intelligent
# typeaheads aware of the current GraphQL type schema and live syntax and
# validation errors highlighted within the text.
#
# GraphQL queries typically start with a "{" character. Lines that start
# with a # are ignored.
#
# Here is an example query to search for patients named Alice:
#
#   {
#     PatientList(name: "Alice") {
#       name {
#         given,
#         family
#       }
#     }
#   }
#
`;

const medplum = new MedplumClient({
  baseUrl: process.env.MEDPLUM_BASE_URL,
  clientId: process.env.MEDPLUM_CLIENT_ID,
});

function App(): JSX.Element {
  const profile = useMedplumProfile();
  return profile ? (
    <GraphiQL fetcher={async (graphQLParams) => medplum.graphql(graphQLParams.query)} defaultQuery={HELP_TEXT} />
  ) : (
    <SignInForm onSuccess={() => undefined} />
  );
}

render(
  <MedplumProvider medplum={medplum}>
    <App />
  </MedplumProvider>,
  document.getElementById('root')
);
