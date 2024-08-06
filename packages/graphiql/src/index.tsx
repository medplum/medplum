import { GraphiQLPlugin } from '@graphiql/react';
import { FetcherParams, SyncExecutionResult } from '@graphiql/toolkit';
import { MantineProvider, Title, createTheme } from '@mantine/core';
import '@mantine/core/styles.css';
import { MedplumClient, ProfileResource, decodeBase64, encodeBase64, getDisplayString } from '@medplum/core';
import { Logo, MedplumProvider, SignInForm, useMedplumProfile } from '@medplum/react';
import '@medplum/react/styles.css';
import GraphiQL from 'graphiql';
import 'graphiql/graphiql.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import 'regenerator-runtime/runtime.js';
import { getConfig } from './config';

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
  baseUrl: import.meta.env.MEDPLUM_BASE_URL,
});

const theme = createTheme({
  headings: {
    sizes: {
      h1: {
        fontSize: '1.125rem',
        fontWeight: '500',
        lineHeight: '2.0',
      },
    },
  },
  fontSizes: {
    xs: '0.6875rem',
    sm: '0.875rem',
    md: '0.875rem',
    lg: '1.0rem',
    xl: '1.125rem',
  },
});

function fetcher(params: FetcherParams): Promise<SyncExecutionResult> {
  if (params.operationName === 'IntrospectionQuery') {
    const config = getConfig().introspectionUrl;
    if (config) {
      return fetch(config).then((res) => res.json());
    }
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
      <p>Project: {medplum.getActiveLogin()?.project.display}</p>
      <p>
        <a href="#" onClick={() => medplum.signOut().then(() => window.location.reload())}>
          Sign out
        </a>
      </p>
    </div>
  ),
};

// Parse the search string to get url parameters.
const searchParams = new URLSearchParams(location.search);
const parameters: FetcherParams = {
  query: tryDecodeBase64(searchParams.get('query')),
  variables: tryDecodeBase64(searchParams.get('variables')),
  operationName: tryDecodeBase64(searchParams.get('operationName')),
};

function onEditQuery(newQuery: string): void {
  parameters.query = newQuery;
  updateURL();
}

function onEditVariables(newVariables: string): void {
  parameters.variables = newVariables;
  updateURL();
}

function onEditOperationName(newOperationName: string): void {
  parameters.operationName = newOperationName;
  updateURL();
}

function updateURL(): void {
  const newSearch = new URLSearchParams();
  newSearch.set('query', tryEncodeBase64(parameters.query));
  newSearch.set('variables', tryEncodeBase64(parameters.variables));
  newSearch.set('operationName', tryEncodeBase64(parameters.operationName));
  history.replaceState(null, '', `?${newSearch}`);
}

function tryEncodeBase64(value: string | null | undefined): string {
  if (!value) {
    return '';
  }
  try {
    return encodeBase64(value);
  } catch (_err) {
    return '';
  }
}

function tryDecodeBase64(value: string | null): string {
  if (!value) {
    return '';
  }
  try {
    return decodeBase64(value);
  } catch (_err) {
    return '';
  }
}

export function App(): JSX.Element {
  const profile = useMedplumProfile();
  return profile ? (
    <GraphiQL
      fetcher={fetcher}
      defaultQuery={HELP_TEXT}
      query={parameters.query || undefined}
      variables={parameters.variables || undefined}
      operationName={parameters.operationName || undefined}
      plugins={[medplumPlugin]}
      onEditQuery={onEditQuery}
      onEditVariables={onEditVariables}
      onEditOperationName={onEditOperationName}
    />
  ) : (
    <SignInForm googleClientId={import.meta.env.GOOGLE_CLIENT_ID} onSuccess={() => undefined}>
      <Logo size={32} />
      <Title>Sign in to Medplum</Title>
    </SignInForm>
  );
}

const root = createRoot(document.getElementById('root') as HTMLElement);
root.render(
  <StrictMode>
    <MedplumProvider medplum={medplum}>
      <MantineProvider theme={theme}>
        <App />
      </MantineProvider>
    </MedplumProvider>
  </StrictMode>
);
