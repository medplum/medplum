// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { MantineProvider } from '@mantine/core';
import { indexSearchParameterBundle, indexStructureDefinitionBundle } from '@medplum/core';
import { readJson, SEARCH_PARAMETER_BUNDLE_FILES } from '@medplum/definitions';
import type { Bundle, SearchParameter } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Spotlight } from './Spotlight';

// Index the structure definitions and search parameters for MockClient
const structureDefinitions = readJson('fhir/r4/profiles-resources.json') as Bundle;
indexStructureDefinitionBundle(structureDefinitions);
for (const filename of SEARCH_PARAMETER_BUNDLE_FILES) {
  indexSearchParameterBundle(readJson(filename) as Bundle<SearchParameter>);
}

// Mock Mantine Spotlight to expose internal behavior for testing
jest.mock('@mantine/spotlight', () => {
  const React = jest.requireActual('react');
  return {
    Spotlight: ({ actions, nothingFound, onQueryChange, searchProps }: any) => {
      const [query, setQuery] = React.useState('');
      return (
        <div data-testid="spotlight">
          <input
            data-testid="spotlight-search"
            placeholder={searchProps?.placeholder}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              onQueryChange?.(e.target.value);
            }}
          />
          {nothingFound && <div data-testid="nothing-found">{nothingFound}</div>}
          {actions?.map((group: any) => (
            <div key={group.group} data-testid={`action-group-${group.group}`}>
              <span>{group.group}</span>
              {group.actions?.map((action: any) => (
                <button key={action.id} data-testid={`action-${action.id}`} onClick={action.onClick}>
                  {action.leftSection}
                  <span>{action.label}</span>
                  <span>{action.description}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      );
    },
  };
});

const mockNavigate = jest.fn();

jest.mock('@medplum/react-hooks', () => {
  const actual = jest.requireActual('@medplum/react-hooks');
  return {
    ...actual,
    useMedplumNavigate: () => mockNavigate,
  };
});

describe('Spotlight', () => {
  let medplum: MockClient;

  async function setup(patientsOnly?: boolean): Promise<ReturnType<typeof render>> {
    return render(
      <MedplumProvider medplum={medplum}>
        <MantineProvider>
          <Spotlight patientsOnly={patientsOnly} />
        </MantineProvider>
      </MedplumProvider>
    );
  }

  beforeEach(() => {
    jest.clearAllMocks();
    mockNavigate.mockReset();
    medplum = new MockClient();
  });

  describe('Initial render', () => {
    test('shows keyboard shortcut hint on initial render', async () => {
      await setup();

      await waitFor(() => {
        expect(screen.getByTestId('nothing-found')).toBeInTheDocument();
      });

      expect(screen.getByText(/Press/)).toBeInTheDocument();
    });

    test('renders spotlight component', async () => {
      await setup();

      expect(screen.getByTestId('spotlight')).toBeInTheDocument();
      expect(screen.getByTestId('spotlight-search')).toBeInTheDocument();
    });
    
  });

  describe('Search functionality', () => {
    test('shows "No results found" after search completes with no results', async () => {
      // Use patientsOnly mode to get predictable results (no valueSetExpand)
      await setup(true);

      const searchInput = screen.getByTestId('spotlight-search');
      await act(async () => {
        fireEvent.change(searchInput, { target: { value: 'nonexistentzzzxxx' } });
      });

      await waitFor(
        () => {
          expect(screen.getByText('No results found')).toBeInTheDocument();
        },
        { timeout: 3000 }
      );
    });

    test('returns to keyboard hint when query is cleared', async () => {
      // Use patientsOnly mode to get predictable results
      await setup(true);

      const searchInput = screen.getByTestId('spotlight-search');

      // First, perform a search
      await act(async () => {
        fireEvent.change(searchInput, { target: { value: 'test' } });
      });

      // Wait for search to complete (MockClient resolves synchronously)
      await waitFor(() => {
        expect(screen.getByText('No results found')).toBeInTheDocument();
      });

      // Then clear the query
      await act(async () => {
        fireEvent.change(searchInput, { target: { value: '' } });
      });

      // Should show keyboard hint again
      await waitFor(() => {
        expect(screen.getByText(/Press/)).toBeInTheDocument();
      });
    });
  });

  describe('patientsOnly mode', () => {
    test('only searches patients when patientsOnly is true', async () => {
      const graphqlSpy = jest.spyOn(medplum, 'graphql');
      const valueSetExpandSpy = jest.spyOn(medplum, 'valueSetExpand');

      await setup(true);

      const searchInput = screen.getByTestId('spotlight-search');
      await act(async () => {
        fireEvent.change(searchInput, { target: { value: 'test' } });
      });

      await waitFor(() => {
        expect(graphqlSpy).toHaveBeenCalled();
      });

      // Should NOT call valueSetExpand when patientsOnly is true
      expect(valueSetExpandSpy).not.toHaveBeenCalled();
    });

    test('searches patients and resource types when patientsOnly is false', async () => {
      const graphqlSpy = jest.spyOn(medplum, 'graphql');
      const valueSetExpandSpy = jest.spyOn(medplum, 'valueSetExpand');

      await setup(false);

      const searchInput = screen.getByTestId('spotlight-search');
      await act(async () => {
        fireEvent.change(searchInput, { target: { value: 'patient' } });
      });

      await waitFor(() => {
        expect(graphqlSpy).toHaveBeenCalled();
        expect(valueSetExpandSpy).toHaveBeenCalled();
      });
    });
  });

  describe('GraphQL query building', () => {
    test('searches by UUID when input is a valid UUID', async () => {
      const graphqlSpy = jest.spyOn(medplum, 'graphql');

      await setup();

      const searchInput = screen.getByTestId('spotlight-search');
      const uuid = '12345678-1234-1234-1234-123456789012';

      await act(async () => {
        fireEvent.change(searchInput, { target: { value: uuid } });
      });

      await waitFor(() => {
        expect(graphqlSpy).toHaveBeenCalled();
      });

      // The GraphQL query for UUID should use _id parameter
      const callArgs = graphqlSpy.mock.calls[0][0] as string;
      expect(callArgs).toContain('_id');
      expect(callArgs).toContain('_count: 1');
    });

    test('searches by name and identifier for non-UUID queries', async () => {
      const graphqlSpy = jest.spyOn(medplum, 'graphql');

      await setup();

      const searchInput = screen.getByTestId('spotlight-search');

      await act(async () => {
        fireEvent.change(searchInput, { target: { value: 'Smith' } });
      });

      await waitFor(() => {
        expect(graphqlSpy).toHaveBeenCalled();
      });

      // The GraphQL query for name should use name and identifier parameters
      const callArgs = graphqlSpy.mock.calls[0][0] as string;
      expect(callArgs).toContain('name:');
      expect(callArgs).toContain('identifier:');
      expect(callArgs).toContain('_count: 5');
    });
  });

  describe('Error handling', () => {
    test('handles GraphQL errors gracefully', async () => {
      jest.spyOn(medplum, 'graphql').mockRejectedValueOnce(new Error('GraphQL error'));

      await setup();

      const searchInput = screen.getByTestId('spotlight-search');
      await act(async () => {
        fireEvent.change(searchInput, { target: { value: 'test' } });
      });

      // Should show "No results found" even after error
      await waitFor(
        () => {
          expect(screen.getByText('No results found')).toBeInTheDocument();
        },
        { timeout: 3000 }
      );
    });

    test('handles valueSetExpand errors gracefully', async () => {
      jest.spyOn(medplum, 'valueSetExpand').mockRejectedValueOnce(new Error('ValueSet error'));

      await setup(false);

      const searchInput = screen.getByTestId('spotlight-search');
      await act(async () => {
        fireEvent.change(searchInput, { target: { value: 'test' } });
      });

      // Should show "No results found" even after error
      await waitFor(
        () => {
          expect(screen.getByText('No results found')).toBeInTheDocument();
        },
        { timeout: 3000 }
      );
    });
  });
});
