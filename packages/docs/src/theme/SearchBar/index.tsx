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
import type { DocSearchSidepanelProps } from '@docsearch/react/sidepanel';
import Head from '@docusaurus/Head';
import Link from '@docusaurus/Link';
import { useHistory, useLocation } from '@docusaurus/router';
import { isRegexpStringMatch, useColorMode, useSearchLinkCreator } from '@docusaurus/theme-common';
import {
  mergeFacetFilters,
  useAlgoliaContextualFacetFilters,
  useSearchResultUrlProcessor,
} from '@docusaurus/theme-search-algolia/client';
import Translate from '@docusaurus/Translate';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import { IconSearch } from '@tabler/icons-react';
import translations from '@theme/SearchTranslations';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ComponentType, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import './styles.css';

import type { AutocompleteState } from '@algolia/autocomplete-core';
import type { ThemeConfigAlgolia } from '@docusaurus/theme-search-algolia';
import type { FacetFilters } from 'algoliasearch/lite';

type DocSearchProps = Omit<DocSearchModalProps, 'onClose' | 'initialScrollY' | 'askAi'> & {
  contextualSearch?: string;
  externalUrlRegex?: string;
  searchPagePath: boolean | string;
};

interface DocSearchV4Props extends DocSearchProps {
  indexName: string;
  askAi?: ThemeConfigAlgolia['askAi'];
  translations?: DocSearchTranslations;
}

let DocSearchModal: typeof DocSearchModalType | null = null;
let DocSearchSidepanel: ComponentType<DocSearchSidepanelProps> | null = null;

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

function importDocSearchSidepanelIfNeeded(): Promise<void> {
  if (DocSearchSidepanel) {
    return Promise.resolve();
  }
  return Promise.all([import('@docsearch/react/sidepanel'), import('@docsearch/react/style/sidepanel')]).then(
    ([{ DocSearchSidepanel: Sidepanel }]) => {
      DocSearchSidepanel = Sidepanel;
    }
  );
}

function useNavigator({ externalUrlRegex }: Pick<DocSearchProps, 'externalUrlRegex'>): DocSearchModalProps['navigator'] {
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
            // Ask AI is handled by AskAiSidePanel, not the keyword search modal
            onAskAiToggle={() => undefined}
          />,
          searchContainer.current
        )}
    </>
  );
}

function AskAiSidePanel({ algolia }: { algolia: DocSearchV4Props }): ReactNode {
  const { pathname } = useLocation();
  const { colorMode } = useColorMode();
  const [ready, setReady] = useState(Boolean(DocSearchSidepanel));
  const isDocsPage = pathname === '/docs' || pathname.startsWith('/docs/');

  const askAi =
    typeof algolia.askAi === 'string'
      ? { assistantId: algolia.askAi }
      : algolia.askAi;
  const assistantId = askAi?.assistantId;

  useEffect(() => {
    if (!assistantId || !isDocsPage || ready) {
      return;
    }
    importDocSearchSidepanelIfNeeded()
      .then(() => setReady(true))
      .catch(console.error);
  }, [assistantId, isDocsPage, ready]);

  if (!isDocsPage || !askAi?.assistantId || !ready || !DocSearchSidepanel) {
    return null;
  }

  return createPortal(
    <DocSearchSidepanel
      appId={askAi.appId ?? algolia.appId}
      apiKey={askAi.apiKey ?? algolia.apiKey}
      indexName={askAi.indexName ?? algolia.indexName}
      assistantId={askAi.assistantId}
      theme={colorMode === 'dark' ? 'dark' : 'light'}
      button={{
        variant: 'floating',
        translations: {
          buttonText: 'Ask AI',
          buttonAriaLabel: 'Ask AI about Medplum docs',
        },
      }}
      panel={{
        variant: 'floating',
        side: 'right',
      }}
    />,
    document.body
  );
}

export default function SearchBar(): ReactNode {
  const { siteConfig } = useDocusaurusContext();
  const { askAi, ...searchConfig } = siteConfig.themeConfig.algolia as DocSearchV4Props;
  return (
    <>
      <DocSearch {...searchConfig} />
      <AskAiSidePanel algolia={{ ...searchConfig, askAi }} />
    </>
  );
}
