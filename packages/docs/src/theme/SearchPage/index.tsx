import Head from '@docusaurus/Head';
import { HtmlClassNameProvider, PageMetadata } from '@docusaurus/theme-common';
import Heading from '@theme/Heading';
import Layout from '@theme/Layout';
import { type ReactNode } from 'react';
import { AlgoliaSearch } from './AlgoliaSearch';

export default function SearchPage(): ReactNode {
  return (
    <HtmlClassNameProvider className="search-page-wrapper">
      <Layout>
        <PageMetadata title="Search" />
        <Head>
          <meta property="robots" content="noindex, follow" />
        </Head>
        <div className="container margin-vert--lg">
          <Heading as="h1">Search the documentation</Heading>
          <AlgoliaSearch />
        </div>
      </Layout>
    </HtmlClassNameProvider>
  );
}
