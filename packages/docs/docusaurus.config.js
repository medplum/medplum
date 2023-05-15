// @ts-check
// Note: type annotations allow type checking and IDEs autocompletion

const lightCodeTheme = require('prism-react-renderer/themes/github');
const darkCodeTheme = require('prism-react-renderer/themes/dracula');

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: 'Medplum',
  tagline: 'Fast and easy healthcare dev',
  url: 'https://www.medplum.com',
  baseUrl: '/',
  trailingSlash: false,
  onBrokenLinks: 'throw',
  onBrokenMarkdownLinks: 'throw',
  favicon: 'img/favicon.ico',
  organizationName: 'medplum', // Usually your GitHub org/user name.
  projectName: 'medplum', // Usually your repo name.
  presets: [
    [
      '@docusaurus/preset-classic',
      /** @type {import('@docusaurus/preset-classic').Options} */
      ({
        docs: {
          sidebarPath: require.resolve('./sidebars.js'),
          editUrl: 'https://github.com/medplum/medplum/blob/main/packages/docs/',
          async sidebarItemsGenerator({ defaultSidebarItemsGenerator, ...args }) {
            // Example: return an hardcoded list of static sidebar items
            let items = await defaultSidebarItemsGenerator(args);
            items = items.filter((e) => !(e.type === 'doc' && e.id.endsWith('index')));
            return items;
          },
        },
        blog: {
          showReadingTime: true,
        },
        theme: {
          customCss: require.resolve('./src/css/custom.css'),
        },
        gtag: {
          trackingID: 'G-SHW0ZNT27G',
        },
      }),
    ],
  ],

  plugins: [
    [
      'docusaurus-plugin-typedoc',
      {
        // Plugin Options
        id: 'sdk',
        out: 'sdk',

        // TypeDoc options
        entryPoints: ['../core/src/index.ts'],
        tsconfig: '../core/tsconfig.json',
        excludePrivate: true,
        excludeProtected: true,
        externalPattern: '**/fhirpath/*.ts',
        excludeExternals: true,
        sort: 'source-order',
        categorizeByGroup: false,
        categoryOrder: [
          'Read',
          'Write',
          'Create',
          'Delete',
          'Media',
          'Authentication',
          'Search',
          'Caching',
          'Batch',
          '*',
          'Other',
        ],
      },
    ],
  ],

  themeConfig:
    /** @type {import('@docusaurus/preset-classic').ThemeConfig} */
    ({
      navbar: {
        title: 'Medplum',
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
            label: 'Documentation',
          },
          {
            to: '/docs/api',
            label: 'Reference',
            position: 'left',
          },
          {
            to: 'https://app.medplum.com/',
            label: 'Sign In',
            position: 'right',
          },
          {
            to: 'https://github.com/medplum/medplum',
            label: 'GitHub',
            position: 'right',
          },
        ],
      },
      footer: {
        links: [
          {
            title: 'Medplum',
            items: [
              {
                html: `
                <a href="/security"><img src="/img/compliance/soc.png" class="medplum-soc-compliance-image" loading="lazy" alt="SOC"></a>
                <a href="/security"><img src="/img/compliance/hipaa.png" class="medplum-hipaa-compliance-image" loading="lazy" alt="HIPAA"></a>
                  `,
              },
            ],
          },
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
                label: 'Search',
                to: '/search',
              },
            ],
          },
          {
            title: 'Community',
            items: [
              {
                label: 'Stack Overflow',
                to: 'https://stackoverflow.com/questions/tagged/medplum',
              },
              {
                label: 'Discord',
                to: 'https://discord.gg/UBAWwvrVeN',
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
                label: 'Contributing',
                to: '/docs/contributing',
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
                label: 'Security',
                to: '/security',
              },
              {
                label: 'Terms of Service',
                to: '/terms',
              },
              {
                label: 'Privacy Policy',
                to: '/privacy',
              },
              {
                label: 'Pricing',
                to: '/pricing',
              },
              {
                label: 'Careers',
                to: '/careers',
              },
              {
                label: 'Blog',
                to: '/blog',
              },
            ],
          },
        ],
        copyright: `Copyright © ${new Date().getFullYear()} Orangebot, Inc.`,
      },
      prism: {
        theme: lightCodeTheme,
        darkTheme: darkCodeTheme,
      },
      image: 'img/medplum.png',
      algolia: {
        // The application ID provided by Algolia
        appId: '6A1DXS603N',

        // Public API key: it is safe to commit it
        apiKey: '75b991071ef4ef1145d63c0a4d0d4665',

        indexName: 'medplum',

        // Optional: see doc section below
        contextualSearch: true,

        // Optional: Algolia search parameters
        searchParameters: {},

        // Optional: path for search page that enabled by default (`false` to disable it)
        searchPagePath: 'search',

        //... other Algolia params
      },
    }),
  markdown: {
    mermaid: true,
  },
  themes: ['@docusaurus/theme-mermaid'],
};

module.exports = config;
