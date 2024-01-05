import { useLayoutEffect } from 'react';
import { useMedplum } from '@medplum/react-hooks';

export type MockGQLWrapperProps = {
  queryMocks: { query: string; response: any }[];
  children: JSX.Element;
};

export function MockGQLWrapper({ queryMocks, children }: MockGQLWrapperProps): JSX.Element | null {
  const medplum = useMedplum();

  // useLayoutEffect instead of useEffect so that this happens before the first render and we don't need to deal
  // with a ready state for demonstration purposes
  useLayoutEffect(() => {
    const realGQL = medplum.graphql;

    async function fakeGraphql(
      query: string,
      _operationName?: string | null,
      _variables?: any,
      _options?: RequestInit
    ): Promise<any> {
      const mock = queryMocks.find((qm) => qm.query === query);
      if (!mock) {
        throw new Error(`Unexpected GQL query: ${query}`);
      }

      console.log(`Returning mocked response for query ${query}`, mock.response);
      return Promise.resolve(mock.response);
    }
    medplum.graphql = fakeGraphql;

    return () => {
      medplum.graphql = realGQL;
    };
  }, [medplum, queryMocks]);

  return children;
}
