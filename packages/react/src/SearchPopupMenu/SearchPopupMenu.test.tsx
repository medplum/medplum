import { Button, Menu } from '@mantine/core';
import { Filter, globalSchema, Operator, SearchRequest } from '@medplum/core';
import { ResourceType, SearchParameter } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { MedplumProvider } from '@medplum/react-hooks';
import { getFieldDefinitions } from '../SearchControl/SearchControlField';
import { SearchPopupMenu, SearchPopupMenuProps } from './SearchPopupMenu';

const medplum = new MockClient();

describe('SearchPopupMenu', () => {
  function setup(partialProps: Partial<SearchPopupMenuProps>): void {
    const props = {
      visible: true,
      x: 0,
      y: 0,
      onPrompt: jest.fn(),
      onChange: jest.fn(),
      onClose: jest.fn(),
      ...partialProps,
    } as SearchPopupMenuProps;

    render(
      <MemoryRouter>
        <MedplumProvider medplum={medplum}>
          <Menu>
            <Menu.Target>
              <Button>Toggle menu</Button>
            </Menu.Target>
            <SearchPopupMenu {...props} />
          </Menu>
        </MedplumProvider>
      </MemoryRouter>
    );
  }

  test('Invalid resource', () => {
    setup({
      search: { resourceType: 'xyz' as ResourceType },
    });
  });

  test('Invalid property', () => {
    setup({
      search: { resourceType: 'Patient' },
    });
  });

  test('Date sort', async () => {
    let currSearch: SearchRequest = {
      resourceType: 'Patient',
    };

    setup({
      search: currSearch,
      searchParams: [globalSchema.types['Patient'].searchParams?.['birthdate'] as SearchParameter],
      onChange: (e) => (currSearch = e),
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Toggle menu'));
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Sort Oldest to Newest'));
    });

    expect(currSearch.sortRules).toBeDefined();
    expect(currSearch.sortRules?.length).toEqual(1);
    expect(currSearch.sortRules?.[0].code).toEqual('birthdate');
    expect(currSearch.sortRules?.[0].descending).toEqual(false);

    await act(async () => {
      fireEvent.click(screen.getByText('Toggle menu'));
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Sort Newest to Oldest'));
    });

    expect(currSearch.sortRules).toBeDefined();
    expect(currSearch.sortRules?.length).toEqual(1);
    expect(currSearch.sortRules?.[0].code).toEqual('birthdate');
    expect(currSearch.sortRules?.[0].descending).toEqual(true);
  });

  test('Date submenu prompt', async () => {
    const searchParam = globalSchema.types['Patient'].searchParams?.['birthdate'] as SearchParameter;
    const onPrompt = jest.fn();

    setup({
      search: {
        resourceType: 'Patient',
      },
      searchParams: [searchParam],
      onPrompt,
    });

    const options = [
      { text: 'Equals...', operator: Operator.EQUALS },
      { text: 'Does not equal...', operator: Operator.NOT_EQUALS },
      { text: 'Before...', operator: Operator.ENDS_BEFORE },
      { text: 'After...', operator: Operator.STARTS_AFTER },
      { text: 'Between...', operator: Operator.EQUALS },
    ];

    for (const option of options) {
      onPrompt.mockClear();

      await act(async () => {
        fireEvent.click(screen.getByText('Toggle menu'));
      });

      await act(async () => {
        fireEvent.click(screen.getByText(option.text));
      });

      expect(onPrompt).toBeCalledWith(searchParam, {
        code: 'birthdate',
        operator: option.operator,
        value: '',
      } as Filter);
    }
  });

  test.each(['Tomorrow', 'Today', 'Yesterday', 'Next Month', 'This Month', 'Last Month', 'Year to date'])(
    '%s shortcut',
    async (option) => {
      let currSearch: SearchRequest = {
        resourceType: 'Patient',
      };

      setup({
        search: currSearch,
        searchParams: [globalSchema.types['Patient'].searchParams?.['birthdate'] as SearchParameter],
        onChange: (e) => (currSearch = e),
      });

      await act(async () => {
        fireEvent.click(screen.getByText('Toggle menu'));
      });

      await act(async () => {
        fireEvent.click(screen.getByText(option));
      });

      expect(currSearch.filters).toBeDefined();
      expect(currSearch.filters?.length).toEqual(2);
      expect(currSearch.filters).toMatchObject([
        {
          code: 'birthdate',
          operator: Operator.GREATER_THAN_OR_EQUALS,
        },
        {
          code: 'birthdate',
          operator: Operator.LESS_THAN_OR_EQUALS,
        },
      ]);
    }
  );

  test('Date missing', async () => {
    let currSearch: SearchRequest = {
      resourceType: 'Patient',
    };

    setup({
      search: currSearch,
      searchParams: [globalSchema.types['Patient'].searchParams?.['birthdate'] as SearchParameter],
      onChange: (e) => (currSearch = e),
    });

    const options = ['Missing', 'Not missing'];
    for (const option of options) {
      await act(async () => {
        fireEvent.click(screen.getByText('Toggle menu'));
      });

      await act(async () => {
        fireEvent.click(screen.getByText(option));
      });

      expect(currSearch.filters).toBeDefined();
      expect(currSearch.filters?.length).toEqual(1);
      expect(currSearch.filters).toMatchObject([
        {
          code: 'birthdate',
          operator: Operator.MISSING,
        },
      ]);
    }
  });

  test('Date clear filters', async () => {
    let currSearch: SearchRequest = {
      resourceType: 'Patient',
      filters: [
        {
          code: 'birthdate',
          operator: Operator.EQUALS,
          value: '2020-01-01',
        },
      ],
    };

    setup({
      search: currSearch,
      searchParams: [globalSchema.types['Patient'].searchParams?.['birthdate'] as SearchParameter],
      onChange: (e) => (currSearch = e),
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Toggle menu'));
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Clear filters'));
    });

    expect(currSearch.filters?.length).toEqual(0);
  });

  test('Quantity sort', async () => {
    const searchParam = globalSchema.types['Observation'].searchParams?.['value-quantity'] as SearchParameter;

    let currSearch: SearchRequest = {
      resourceType: 'Patient',
    };

    setup({
      search: currSearch,
      searchParams: [searchParam],
      onChange: (e) => (currSearch = e),
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Toggle menu'));
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Sort Smallest to Largest'));
    });

    expect(currSearch.sortRules).toBeDefined();
    expect(currSearch.sortRules?.length).toEqual(1);
    expect(currSearch.sortRules?.[0].code).toEqual('value-quantity');
    expect(currSearch.sortRules?.[0].descending).toEqual(false);

    await act(async () => {
      fireEvent.click(screen.getByText('Toggle menu'));
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Sort Largest to Smallest'));
    });

    expect(currSearch.sortRules).toBeDefined();
    expect(currSearch.sortRules?.length).toEqual(1);
    expect(currSearch.sortRules?.[0].code).toEqual('value-quantity');
    expect(currSearch.sortRules?.[0].descending).toEqual(true);
  });

  test('Quantity submenu prompt', async () => {
    const searchParam = globalSchema.types['Observation'].searchParams?.['value-quantity'] as SearchParameter;
    const onPrompt = jest.fn();

    setup({
      search: {
        resourceType: 'Observation',
      },
      searchParams: [searchParam],
      onPrompt,
    });

    const options = [
      { text: 'Equals...', operator: Operator.EQUALS },
      { text: 'Does not equal...', operator: Operator.NOT_EQUALS },
      { text: 'Greater than...', operator: Operator.GREATER_THAN },
      { text: 'Greater than or equal to...', operator: Operator.GREATER_THAN_OR_EQUALS },
      { text: 'Less than...', operator: Operator.LESS_THAN },
      { text: 'Less than or equal to...', operator: Operator.LESS_THAN_OR_EQUALS },
    ];

    for (const option of options) {
      onPrompt.mockClear();

      await act(async () => {
        fireEvent.click(screen.getByText('Toggle menu'));
      });

      await act(async () => {
        fireEvent.click(screen.getByText(option.text));
      });

      expect(onPrompt).toBeCalledWith(searchParam, {
        code: 'value-quantity',
        operator: option.operator,
        value: '',
      } as Filter);
    }
  });

  test('Quantity missing', async () => {
    const searchParam = globalSchema.types['Observation'].searchParams?.['value-quantity'] as SearchParameter;

    let currSearch: SearchRequest = {
      resourceType: 'Observation',
    };

    setup({
      search: currSearch,
      searchParams: [searchParam],
      onChange: (e) => (currSearch = e),
    });

    const options = ['Missing', 'Not missing'];
    for (const option of options) {
      await act(async () => {
        fireEvent.click(screen.getByText('Toggle menu'));
      });

      await act(async () => {
        fireEvent.click(screen.getByText(option));
      });

      expect(currSearch.filters).toBeDefined();
      expect(currSearch.filters?.length).toEqual(1);
      expect(currSearch.filters).toMatchObject([
        {
          code: 'value-quantity',
          operator: Operator.MISSING,
        },
      ]);
    }
  });

  test('Quantity clear filters', async () => {
    const searchParam = globalSchema.types['Observation'].searchParams?.['value-quantity'] as SearchParameter;

    let currSearch: SearchRequest = {
      resourceType: 'Observation',
      filters: [
        {
          code: 'value-quantity',
          operator: Operator.EQUALS,
          value: '100',
        },
      ],
    };

    setup({
      search: currSearch,
      searchParams: [searchParam],
      onChange: (e) => (currSearch = e),
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Toggle menu'));
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Clear filters'));
    });

    expect(currSearch.filters?.length).toEqual(0);
  });

  test('Reference clear filters', async () => {
    let currSearch: SearchRequest = {
      resourceType: 'Patient',
      filters: [
        {
          code: 'organization',
          operator: Operator.EQUALS,
          value: 'Organization/123',
        },
      ],
    };

    setup({
      search: currSearch,
      searchParams: [globalSchema.types['Patient'].searchParams?.['organization'] as SearchParameter],
      onChange: (e) => (currSearch = e),
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Toggle menu'));
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Clear filters'));
    });

    expect(currSearch.filters?.length).toEqual(0);
  });

  test('Reference submenu prompt', async () => {
    const searchParam = globalSchema.types['Patient'].searchParams?.['organization'] as SearchParameter;
    const onPrompt = jest.fn();

    setup({
      search: {
        resourceType: 'Patient',
      },
      searchParams: [searchParam],
      onPrompt,
    });

    const options = [
      { text: 'Equals...', operator: Operator.EQUALS },
      { text: 'Does not equal...', operator: Operator.NOT },
    ];

    for (const option of options) {
      onPrompt.mockClear();

      await act(async () => {
        fireEvent.click(screen.getByText('Toggle menu'));
      });

      await act(async () => {
        fireEvent.click(screen.getByText(option.text));
      });

      expect(onPrompt).toBeCalledWith(searchParam, {
        code: 'organization',
        operator: option.operator,
        value: '',
      } as Filter);
    }
  });

  test('Reference missing', async () => {
    const searchParam = globalSchema.types['Patient'].searchParams?.['organization'] as SearchParameter;

    let currSearch: SearchRequest = {
      resourceType: 'Patient',
    };

    setup({
      search: currSearch,
      searchParams: [searchParam],
      onChange: (e) => (currSearch = e),
    });

    const options = ['Missing', 'Not missing'];
    for (const option of options) {
      await act(async () => {
        fireEvent.click(screen.getByText('Toggle menu'));
      });

      await act(async () => {
        fireEvent.click(screen.getByText(option));
      });

      expect(currSearch.filters).toBeDefined();
      expect(currSearch.filters?.length).toEqual(1);
      expect(currSearch.filters).toMatchObject([
        {
          code: 'organization',
          operator: Operator.MISSING,
        },
      ]);
    }
  });

  test('Text sort', async () => {
    let currSearch: SearchRequest = {
      resourceType: 'Patient',
    };

    setup({
      search: currSearch,
      searchParams: [globalSchema.types['Patient'].searchParams?.['name'] as SearchParameter],
      onChange: (e) => (currSearch = e),
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Toggle menu'));
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Sort A to Z'));
    });

    expect(currSearch.sortRules).toBeDefined();
    expect(currSearch.sortRules?.length).toEqual(1);
    expect(currSearch.sortRules?.[0].code).toEqual('name');
    expect(currSearch.sortRules?.[0].descending).toEqual(false);

    await act(async () => {
      fireEvent.click(screen.getByText('Toggle menu'));
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Sort Z to A'));
    });

    expect(currSearch.sortRules).toBeDefined();
    expect(currSearch.sortRules?.length).toEqual(1);
    expect(currSearch.sortRules?.[0].code).toEqual('name');
    expect(currSearch.sortRules?.[0].descending).toEqual(true);
  });

  test('Text clear filters', async () => {
    let currSearch: SearchRequest = {
      resourceType: 'Patient',
      filters: [
        {
          code: 'name',
          operator: Operator.EQUALS,
          value: 'Alice',
        },
      ],
    };

    setup({
      search: currSearch,
      searchParams: [globalSchema.types['Patient'].searchParams?.['name'] as SearchParameter],
      onChange: (e) => (currSearch = e),
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Toggle menu'));
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Clear filters'));
    });

    expect(currSearch.filters?.length).toEqual(0);
  });

  test('Text submenu prompt', async () => {
    const searchParam = globalSchema.types['Patient'].searchParams?.['name'] as SearchParameter;
    const onPrompt = jest.fn();

    setup({
      search: {
        resourceType: 'Patient',
      },
      searchParams: [searchParam],
      onPrompt,
    });

    const options = [
      { text: 'Equals...', operator: Operator.EQUALS },
      { text: 'Does not equal...', operator: Operator.NOT },
      { text: 'Contains...', operator: Operator.CONTAINS },
      { text: 'Does not contain...', operator: Operator.EQUALS },
    ];

    for (const option of options) {
      onPrompt.mockClear();

      await act(async () => {
        fireEvent.click(screen.getByText('Toggle menu'));
      });

      await act(async () => {
        fireEvent.click(screen.getByText(option.text));
      });

      expect(onPrompt).toBeCalledWith(searchParam, {
        code: 'name',
        operator: option.operator,
        value: '',
      } as Filter);
    }
  });

  test('Text missing', async () => {
    const searchParam = globalSchema.types['Patient'].searchParams?.['name'] as SearchParameter;

    let currSearch: SearchRequest = {
      resourceType: 'Patient',
    };

    setup({
      search: currSearch,
      searchParams: [searchParam],
      onChange: (e) => (currSearch = e),
    });

    const options = ['Missing', 'Not missing'];
    for (const option of options) {
      await act(async () => {
        fireEvent.click(screen.getByText('Toggle menu'));
      });

      await act(async () => {
        fireEvent.click(screen.getByText(option));
      });

      expect(currSearch.filters).toBeDefined();
      expect(currSearch.filters?.length).toEqual(1);
      expect(currSearch.filters).toMatchObject([
        {
          code: 'name',
          operator: Operator.MISSING,
        },
      ]);
    }
  });

  test('Renders meta.versionId', async () => {
    const search: SearchRequest = {
      resourceType: 'Patient',
      fields: ['meta.versionId'],
    };

    const fields = getFieldDefinitions(search);

    setup({
      search,
      searchParams: fields[0].searchParams,
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Toggle menu'));
    });

    expect(screen.getByText('Equals...')).toBeDefined();
  });

  test('Renders _lastUpdated', async () => {
    const search: SearchRequest = {
      resourceType: 'Patient',
      fields: ['_lastUpdated'],
    };

    const fields = getFieldDefinitions(search);

    setup({
      search: {
        resourceType: 'Patient',
      },
      searchParams: fields[0].searchParams,
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Toggle menu'));
    });

    expect(screen.getByText('Before...')).toBeDefined();
    expect(screen.getByText('After...')).toBeDefined();
  });

  test('Search parameter choice', async () => {
    const search: SearchRequest = {
      resourceType: 'Observation',
      fields: ['value[x]'],
    };

    const fields = getFieldDefinitions(search);

    setup({
      search: {
        resourceType: 'Observation',
      },
      searchParams: fields[0].searchParams,
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Toggle menu'));
    });

    expect(screen.getByText('Value Quantity')).toBeDefined();
    expect(screen.getByText('Value String')).toBeDefined();
  });

  test('Only one search parameter on exact match', async () => {
    globalSchema.types['Observation'].searchParams = {
      subject: {
        resourceType: 'SearchParameter',
        code: 'patient',
        type: 'reference',
        expression: 'Observation.patient',
      },
    };

    const search: SearchRequest = {
      resourceType: 'Observation',
      fields: ['subject'],
    };

    const fields = getFieldDefinitions(search);

    setup({
      search: {
        resourceType: 'Observation',
      },
      searchParams: fields[0].searchParams,
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Toggle menu'));
    });

    expect(screen.getByText('Equals...')).toBeDefined();
    expect(screen.queryByText('Patient')).toBeNull();
  });
});
