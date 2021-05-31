import GraphiQL from 'graphiql';
import { MedplumClient } from '@medplum/core';
import React from 'react';
import { render } from 'react-dom';
import 'regenerator-runtime/runtime.js';
import 'graphiql/graphiql.css';

const medplum = new MedplumClient({
  baseUrl: process.env.MEDPLUM_BASE_URL,
  clientId: process.env.MEDPLUM_CLIENT_ID,
});

const App = () => (
  <GraphiQL
    fetcher={async graphQLParams => medplum.graphql(graphQLParams)}
  />
);

render(<App />, document.getElementById('root'));
