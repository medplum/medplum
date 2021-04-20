import GraphiQL from 'graphiql';
import React from 'react';
import { render } from 'react-dom';
import 'regenerator-runtime/runtime.js';
import 'graphiql/graphiql.css';

const App = () => (
  <GraphiQL
    fetcher={async graphQLParams => {
      const data = await fetch('http://localhost:5000/fhir/R4/$graphql', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(graphQLParams),
        credentials: 'same-origin',
      });
      return data.json().catch(() => data.text());
    }}
  />
);

render(<App />, document.getElementById('root'));
