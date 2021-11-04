import { MedplumClient } from '@medplum/core';
import { Document, MedplumProvider, SignInForm, useMedplumProfile } from '@medplum/ui';
import GraphiQL from 'graphiql';
import React from 'react';
import { render } from 'react-dom';
import 'regenerator-runtime/runtime.js';
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

const router = {
  push: (path: string, state: any) => {
    console.log('Navigate to: ' + path + ' (state=' + JSON.stringify(state) + ')');
  },
  listen: () => (() => undefined)
};

function App() {
  const profile = useMedplumProfile();
  return profile ? (
    <GraphiQL
      fetcher={async graphQLParams => medplum.graphql(graphQLParams)}
      defaultQuery={HELP_TEXT}
    />
  ) : (
    <Document width={450}>
      <SignInForm onSuccess={() => undefined} />
    </Document>
  );
}

render((
  <MedplumProvider medplum={medplum} router={router}>
    <App />
  </MedplumProvider>
), document.getElementById('root'));
