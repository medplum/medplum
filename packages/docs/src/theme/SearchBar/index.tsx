// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type {
  DocSearchHit,
  DocSearchModalProps,
  DocSearchModal as DocSearchModalType,
  DocSearchTransformClient,
  DocSearchTranslations,
  InternalDocSearchHit,
  StoredDocSearchHit,
  UseDocSearchKeyboardEventsProps,
} from '@docsearch/react';
import { useDocSearchKeyboardEvents } from '@docsearch/react/useDocSearchKeyboardEvents';
import Head from '@docusaurus/Head';
import Link from '@docusaurus/Link';
import { useHistory } from '@docusaurus/router';
import { isRegexpStringMatch, useSearchLinkCreator } from '@docusaurus/theme-common';
import {
  mergeFacetFilters,
  useAlgoliaContextualFacetFilters,
  useSearchResultUrlProcessor,
} from '@docusaurus/theme-search-algolia/client';
import Translate from '@docusaurus/Translate';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import { IconSearch } from '@tabler/icons-react';
import translations from '@theme/SearchTranslations';
import type { ReactNode } from 'react';
import { useCallback, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import './styles.css';

import type { AutocompleteState } from '@algolia/autocomplete-core';
import type { FacetFilters } from 'algoliasearch/lite';

type DocSearchProps = Omit<DocSearchModalProps, 'onClose' | 'initialScrollY' | 'askAi'> & {
  contextualSearch?: string;
  externalUrlRegex?: string;
  searchPagePath: boolean | string;
};

interface DocSearchV4Props extends DocSearchProps {
  indexName: string;
  translations?: DocSearchTranslations;
}

let DocSearchModal: typeof DocSearchModalType | null = null;

function importDocSearchModalIfNeeded(): Promise<void> {
  if (DocSearchModal) {
    return Promise.resolve();
  }
  return Promise.all([import('@docsearch/react/modal'), import('@docsearch/react/style')]).then(
    ([{ DocSearchModal: Modal }]) => {
      DocSearchModal = Modal;
    }
  );
}

function useNavigator({
  externalUrlRegex,
}: Pick<DocSearchProps, 'externalUrlRegex'>): DocSearchModalProps['navigator'] {
  const history = useHistory();
  const [navigator] = useState<DocSearchModalProps['navigator']>(() => {
    return {
      navigate(params) {
        // Algolia results could contain URL's from other domains which cannot
        // be served through history and should navigate with window.location
        if (isRegexpStringMatch(externalUrlRegex, params.itemUrl)) {
          window.location.href = params.itemUrl;
        } else {
          history.push(params.itemUrl);
        }
      },
    };
  });
  return navigator;
}

function useTransformSearchClient(): DocSearchModalProps['transformSearchClient'] {
  const {
    siteMetadata: { docusaurusVersion },
  } = useDocusaurusContext();
  return useCallback(
    (searchClient: DocSearchTransformClient) => {
      searchClient.addAlgoliaAgent('docusaurus', docusaurusVersion);
      return searchClient;
    },
    [docusaurusVersion]
  );
}

function useTransformItems(props: Pick<DocSearchProps, 'transformItems'>): DocSearchModalProps['transformItems'] {
  const processSearchResultUrl = useSearchResultUrlProcessor();
  const [transformItems] = useState<DocSearchModalProps['transformItems']>(() => {
    return (items: DocSearchHit[]) =>
      props.transformItems
        ? props.transformItems(items)
        : items.map((item) => ({
            ...item,
            url: processSearchResultUrl(item.url),
          }));
  });
  return transformItems;
}

function useResultsFooterComponent({
  closeModal,
}: {
  closeModal: () => void;
}): DocSearchProps['resultsFooterComponent'] {
  return useMemo(
    () =>
      ({ state }) => <ResultsFooter state={state} onClose={closeModal} />,
    [closeModal]
  );
}

function Hit({ hit, children }: { hit: InternalDocSearchHit | StoredDocSearchHit; children: ReactNode }): ReactNode {
  return <Link to={hit.url}>{children}</Link>;
}

type ResultsFooterProps = {
  state: AutocompleteState<InternalDocSearchHit>;
  onClose: () => void;
};

function ResultsFooter({ state, onClose }: ResultsFooterProps): ReactNode {
  const createSearchLink = useSearchLinkCreator();

  return (
    <Link to={createSearchLink(state.query)} onClick={onClose}>
      <Translate id="theme.SearchBar.seeAll" values={{ count: state.context.nbHits }}>
        {'See all {count} results'}
      </Translate>
    </Link>
  );
}

function useSearchParameters({ contextualSearch, ...props }: DocSearchProps): DocSearchProps['searchParameters'] {
  const contextualSearchFacetFilters = useAlgoliaContextualFacetFilters();
  const configFacetFilters: FacetFilters = props.searchParameters?.facetFilters ?? [];
  const facetFilters: FacetFilters = contextualSearch
    ? mergeFacetFilters(contextualSearchFacetFilters, configFacetFilters)
    : configFacetFilters;

  return {
    ...props.searchParameters,
    facetFilters,
  };
}

function DocSearch({ externalUrlRegex, ...props }: DocSearchProps): ReactNode {
  const navigator = useNavigator({ externalUrlRegex });
  const searchParameters = useSearchParameters(props);
  const transformItems = useTransformItems(props);
  const transformSearchClient = useTransformSearchClient();

  const searchContainer = useRef<HTMLDivElement | null>(null);
  const searchButtonRef = useRef<HTMLButtonElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [initialQuery, setInitialQuery] = useState<string | undefined>(undefined);

  const prepareSearchContainer = useCallback(() => {
    if (!searchContainer.current) {
      const divElement = document.createElement('div');
      searchContainer.current = divElement;
      document.body.insertBefore(divElement, document.body.firstChild);
    }
  }, []);

  const openModal = useCallback(() => {
    prepareSearchContainer();
    importDocSearchModalIfNeeded()
      .then(() => setIsOpen(true))
      .catch(console.error);
  }, [prepareSearchContainer]);

  const closeModal = useCallback(() => {
    setIsOpen(false);
    searchButtonRef.current?.focus();
    setInitialQuery(undefined);
  }, []);

  const handleInput = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === 'f' && (event.metaKey || event.ctrlKey)) {
        return;
      }
      event.preventDefault();
      setInitialQuery(event.key);
      openModal();
    },
    [openModal]
  );

  const resultsFooterComponent = useResultsFooterComponent({ closeModal });

  useDocSearchKeyboardEvents({
    isOpen,
    onOpen: openModal,
    onClose: closeModal,
    onInput: handleInput,
    searchButtonRef,
    isAskAiActive: false,
    onAskAiToggle: () => undefined,
  } as UseDocSearchKeyboardEventsProps);

  return (
    <>
      <Head>
        {/* Preconnect to Algolia so the first search query is faster, especially on mobile. */}
        <link rel="preconnect" href={`https://${props.appId}-dsn.algolia.net`} crossOrigin="anonymous" />
      </Head>

      <button
        type="button"
        onTouchStart={importDocSearchModalIfNeeded}
        onFocus={importDocSearchModalIfNeeded}
        onMouseOver={importDocSearchModalIfNeeded}
        onClick={openModal}
        ref={searchButtonRef}
        className="searchButton"
        aria-label="Search"
      >
        <IconSearch size={18} stroke={2} />
      </button>

      {isOpen &&
        DocSearchModal &&
        searchContainer.current &&
        createPortal(
          <DocSearchModal
            onClose={closeModal}
            initialScrollY={window.scrollY}
            initialQuery={initialQuery}
            navigator={navigator}
            transformItems={transformItems}
            hitComponent={Hit}
            transformSearchClient={transformSearchClient}
            {...(props.searchPagePath && {
              resultsFooterComponent,
            })}
            {...props}
            translations={props.translations?.modal ?? translations.modal}
            searchParameters={searchParameters}
            // AI chat is served by the Kapa widget, not DocSearch
            onAskAiToggle={() => undefined}
          />,
          searchContainer.current
        )}
    </>
  );
}

export default function SearchBar(): ReactNode {
  const { siteConfig } = useDocusaurusContext();
  return <DocSearch {...(siteConfig.themeConfig.algolia as DocSearchV4Props)} />;
}
