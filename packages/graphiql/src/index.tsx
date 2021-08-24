import { MedplumClient } from '@medplum/core';
import { Document, MedplumProvider, SignInForm, useMedplumContext } from '@medplum/ui';
import GraphiQL from 'graphiql';
import React from 'react';
import { render } from 'react-dom';
import 'regenerator-runtime/runtime.js';
import 'graphiql/graphiql.css';

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
  const profile = useMedplumContext().profile;
  return profile ? (
    <GraphiQL
      fetcher={async graphQLParams => medplum.graphql(graphQLParams)}
    />
  ) : (
    <Document width={450}>
      <SignInForm />
    </Document>
  );
}

render((
  <MedplumProvider medplum={medplum} router={router}>
    <App />
  </MedplumProvider>
), document.getElementById('root'));
