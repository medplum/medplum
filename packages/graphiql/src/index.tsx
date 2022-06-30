import { MedplumClient } from '@medplum/core';
import { Logo, MedplumProvider, SignInForm, useMedplumProfile } from '@medplum/react';
import GraphiQL from 'graphiql';
import React from 'react';
import { render } from 'react-dom';
import 'regenerator-runtime/runtime.js';
import '@medplum/react/defaulttheme.css';
import '@medplum/react/styles.css';
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
});

function App(): JSX.Element {
  const profile = useMedplumProfile();
  return profile ? (
    <GraphiQL fetcher={async (graphQLParams) => medplum.graphql(graphQLParams.query)} defaultQuery={HELP_TEXT} />
  ) : (
    <SignInForm googleClientId={process.env.GOOGLE_CLIENT_ID} onSuccess={() => undefined}>
      <Logo size={32} />
      <h1>Sign in to Medplum</h1>
    </SignInForm>
  );
}

render(
  <MedplumProvider medplum={medplum}>
    <App />
  </MedplumProvider>,
  document.getElementById('root')
);
