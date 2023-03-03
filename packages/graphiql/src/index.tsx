import { GraphiQLPlugin } from '@graphiql/react';
import { FetcherParams, SyncExecutionResult } from '@graphiql/toolkit';
import { MantineProvider, MantineThemeOverride, Title } from '@mantine/core';
import { getDisplayString, MedplumClient, ProfileResource } from '@medplum/core';
import { Logo, MedplumProvider, SignInForm, useMedplumProfile } from '@medplum/react';
import GraphiQL from 'graphiql';
import React from 'react';
import { createRoot } from 'react-dom/client';

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
});

const theme: MantineThemeOverride = {
  headings: {
    sizes: {
      h1: {
        fontSize: 18,
        fontWeight: 500,
        lineHeight: 2.0,
      },
    },
  },
  fontSizes: {
    xs: 11,
    sm: 14,
    md: 14,
    lg: 16,
    xl: 18,
  },
};

function fetcher(params: FetcherParams): Promise<SyncExecutionResult> {
  if (params.operationName === 'IntrospectionQuery') {
    return fetch('/schema/schema-v1.json').then((res) => res.json());
  }
  return medplum.graphql(params.query, params.operationName, params.variables);
}

const medplumPlugin: GraphiQLPlugin = {
  title: 'Medplum',
  icon: () => <Logo size={24} />,
  content: () => (
    <div>
      <p>Medplum GraphiQL</p>
      <p>User: {getDisplayString(medplum.getProfile() as ProfileResource)}</p>
      <p>Project: {medplum.getActiveLogin()?.project?.display}</p>
      <p>
        <a href="#" onClick={() => medplum.signOut().then(() => window.location.reload())}>
          Sign out
        </a>
      </p>
    </div>
  ),
};

function App(): JSX.Element {
  const profile = useMedplumProfile();
  return profile ? (
    <GraphiQL fetcher={fetcher} defaultQuery={HELP_TEXT} plugins={[medplumPlugin]} />
  ) : (
    <SignInForm googleClientId={process.env.GOOGLE_CLIENT_ID} onSuccess={() => undefined}>
      <Logo size={32} />
      <Title>Sign in to Medplum</Title>
    </SignInForm>
  );
}

const root = createRoot(document.getElementById('root') as HTMLElement);
root.render(
  <React.StrictMode>
    <MedplumProvider medplum={medplum}>
      <MantineProvider theme={theme} withGlobalStyles withNormalizeCSS>
        <App />
      </MantineProvider>
    </MedplumProvider>
  </React.StrictMode>
);
