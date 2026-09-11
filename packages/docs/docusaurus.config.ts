// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type * as Preset from '@docusaurus/preset-classic';
import type { Config } from '@docusaurus/types';
import { themes as prismThemes } from 'prism-react-renderer';

/**
 * Algolia DocSearch credentials for docs search + Ask AI side panel.
 *
 * Search appId / apiKey / indexName are public (search-only key; safe to commit).
 * askAiAssistantId comes from Algolia Dashboard → DocSearch → Ask AI.
 */
const ALGOLIA = {
  appId: '6A1DXS603N',
  // Public search-only API key (safe to commit)
  apiKey: '06bafd15f5a637275ed20297927355f9',
  indexName: 'medplum',
  askAiAssistantId: 'c8e02cae-c0cf-4dd1-bba6-344a75826944',
} as const;

const config: Config = {
  title: 'Medplum',
  tagline: 'Fast and easy healthcare dev',
  url: 'https://www.medplum.com',
  baseUrl: '/',
  trailingSlash: false,
  onBrokenLinks: 'throw',
  onBrokenAnchors: 'throw',
  onDuplicateRoutes: 'throw',
  favicon: 'favicon.ico',
  organizationName: 'medplum', // Usually your GitHub org/user name.
  projectName: 'medplum', // Usually your repo name.

  // Set this to true to enable the faster experimental build mode.
  // https://github.com/facebook/docusaurus/issues/10556
  future: {
    v4: true,
    faster: true,
  },

  clientModules: [
    './src/clientModules/gtagDevShim.ts',
    // Local dev always tints; deployed builds only when Medplum sets the flag (forks stay untouched).
    ...(process.env.MEDPLUM_ENVIRONMENT_FAVICON === 'true' || process.env.NODE_ENV !== 'production'
      ? ['./src/clientModules/environmentFavicon.ts']
      : []),
  ],

  // Even if you don't use internationalization, you can use this field to set
  // useful metadata like html lang. For example, if your site is Chinese, you
  // may want to replace "en" with "zh-Hans".
  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  plugins: [
    [
      '@docusaurus/plugin-client-redirects',
      {
        redirects: [
          {
            from: '/docs/communications/organizing-communications',
            to: '/docs/communications/messaging-data-model',
          },
          {
            from: '/docs/communications/task-based-message-response-tracking-and-routing',
            to: '/docs/communications/message-response-tracking-and-routing',
          },
          {
            from: '/docs/charting/ordering-labs-imaging',
            to: '/docs/labs-imaging/ordering-labs-imaging',
          },
          {
            from: '/docs/charting/soap-notes',
            to: '/docs/charting/visit-templates',
          },
          {
            from: '/docs/charting/capturing-vital-signs',
            to: '/docs/charting/chart-data-model',
          },
          {
            from: '/docs/charting/representing-diagnoses',
            to: '/docs/charting/chart-data-model',
          },
          {
            from: '/docs/charting/allergy-intolerances',
            to: '/docs/charting/chart-data-model',
          },
          {
            from: '/docs/charting/patient-demographics',
            to: '/docs/charting/chart-data-model',
          },
          {
            from: '/docs/charting/implantable-devices',
            to: '/docs/charting/chart-data-model',
          },
          {
            from: '/docs/charting/external-documents',
            to: '/docs/fhir-datastore/external-documents',
          },
          {
            from: '/docs/questionnaires/structured-data-capture',
            to: '/docs/questionnaires/parsing-questionnaire-responses',
          },
          {
            from: '/docs/integration/stedi/eligibility-checks',
            to: '/docs/integration/stedi/insurance-eligibility/eligibility-checks',
          },
          {
            from: '/docs/integration/stedi/professional-claims',
            to: '/docs/integration/stedi/claim-submission/professional-claims',
          },
        ],
      },
    ],
  ],

  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
          editUrl: 'https://github.com/medplum/medplum/blob/main/packages/docs/',
          async sidebarItemsGenerator({ defaultSidebarItemsGenerator, ...args }) {
            // Example: return an hardcoded list of static sidebar items
            let items = await defaultSidebarItemsGenerator(args);
            items = items.filter((e) => !(e.type === 'doc' && e.id.endsWith('index')));
            return items;
          },
          showLastUpdateTime: true,
        },
        blog: {
          showReadingTime: true,
          blogSidebarCount: 15,
          blogSidebarTitle: 'Recent posts',
        },
        theme: {
          customCss: './src/css/custom.css',
        },
        // Only enable Google Analytics for production builds. The plugin disables itself outside
        // production anyway; this keeps the tracking ID out of dev entirely. See
        // src/clientModules/gtagDevShim.ts for why that is not sufficient on its own.
        gtag:
          process.env.NODE_ENV === 'production'
            ? {
                trackingID: 'G-SHW0ZNT27G',
              }
            : undefined,
      },
    ],
  ],

  headTags: [
    {
      tagName: 'link',
      attributes: {
        rel: 'apple-touch-icon',
        sizes: '180x180',
        href: '/img/medplum-apple-touch-icon.png',
      },
    },
    {
      tagName: 'link',
      attributes: {
        rel: 'manifest',
        href: '/manifest.json',
      },
    },
  ],

  themeConfig: {
    navbar: {
      logo: {
        alt: 'Medplum Logo',
        src: 'img/logo.svg',
        width: 24,
        height: 32,
      },
      items: [
        {
          to: '/products',
          label: 'Products',
          position: 'left',
        },
        {
          to: '/solutions',
          label: 'Solutions',
          position: 'left',
        },
        {
          type: 'doc',
          docId: 'home',
          position: 'left',
          label: 'Resources',
        },
        {
          to: '/pricing',
          label: 'Pricing',
          position: 'left',
        },
        {
          to: 'https://app.medplum.com/signin',
          label: 'Sign In',
          position: 'right',
          className: 'button button--outline button--primary navbar-btn navbar-btn-outlined',
        },
        {
          to: 'https://cal.com/forms/9da7bfa2-40f5-461d-ad64-33d20bd32a7a',
          label: 'Book a Demo',
          position: 'right',
          className: 'button button--primary navbar-btn navbar-btn-filled',
        },
      ],
    },
    footer: {
      links: [
        {
          title: 'Developers',
          items: [
            {
              label: 'Getting started',
              to: '/docs/tutorials',
            },
            {
              label: 'Documentation',
              to: '/docs',
            },
            {
              label: 'Why Open Source',
              to: '/open-source',
            },
            {
              label: 'Search',
              to: '/search',
            },
          ],
        },
        {
          title: 'Community',
          items: [
            {
              label: 'Case Studies',
              to: '/case-studies',
            },
            {
              label: 'Discord',
              to: 'https://discord.gg/medplum',
            },
            {
              label: 'Storybook',
              to: 'https://storybook.medplum.com/',
            },
            {
              label: 'GitHub',
              to: 'https://github.com/medplum/medplum',
            },
            {
              label: 'Knowledge Base',
              to: 'https://linen.medplum.com',
            },
            {
              label: 'Contributing',
              to: '/docs/contributing',
            },
            {
              label: 'Events',
              to: '/blog/events-calendar',
            },
          ],
        },
        {
          title: 'Company',
          items: [
            {
              label: 'About us',
              to: '/about',
            },
            {
              label: 'Pricing',
              to: '/pricing',
            },
            {
              label: 'Enterprise',
              to: '/enterprise',
            },
            {
              label: 'Careers',
              to: '/careers',
            },
            {
              label: 'Blog',
              to: '/blog',
            },
            {
              label: 'Brand',
              to: '/brand',
            },
            {
              label: 'Book a Demo',
              to: 'https://cal.com/forms/9da7bfa2-40f5-461d-ad64-33d20bd32a7a',
            },
          ],
        },
      ],
      copyright: `© ${new Date().getFullYear()} Orangebot, Inc.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
    },
    image: 'img/medplum-og-cover-image.png',
    algolia: {
      appId: ALGOLIA.appId,
      apiKey: ALGOLIA.apiKey,
      indexName: ALGOLIA.indexName,
      contextualSearch: true,
      searchParameters: {},
      searchPagePath: 'search',
      // Enables the Ask AI side panel when an assistant ID is configured
      ...(ALGOLIA.askAiAssistantId
        ? {
            askAi: {
              assistantId: ALGOLIA.askAiAssistantId,
            },
          }
        : {}),
    },
  } satisfies Preset.ThemeConfig,
  markdown: {
    mermaid: true,
    hooks: {
      onBrokenMarkdownLinks: 'throw',
    },
  },
  themes: ['@docusaurus/theme-mermaid'],
  scripts: [
    {
      src: 'https://cdn-cookieyes.com/client_data/11362a9d5311bc6aa21c5f47d05599c6/script.js',
    },
    {
      src: 'https://ddwl4m2hdecbv.cloudfront.net/b/LNKLDHEYLZOJ/LNKLDHEYLZOJ.js.gz',
      async: true,
    },
  ],
};

export default config;
