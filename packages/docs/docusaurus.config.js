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
        },
        items: [
          {
            type: 'doc',
            docId: 'home',
            position: 'left',
            label: 'Docs',
          },
          {
            to: '/docs/tutorials',
            label: 'Tutorials',
            position: 'left',
          },
          {
            to: '/docs/api',
            label: 'API',
            position: 'left',
          },
          {
            to: '/docs/contributing',
            label: 'Contributing',
            position: 'left',
          },
          {
            to: '/blog',
            label: 'Blog',
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
                <a href="/security"><img src="/img/compliance/soc.png" style="width: 45px; height: 45px; margin: 4px;" loading="lazy" alt="SOC"></a>
                <a href="/security"><img src="/img/compliance/hipaa.png" style="width: 100px; height: 45px; margin: 4px;" loading="lazy" alt="HIPAA"></a>
                  `,
              },
            ],
          },
          {
            title: 'Developers',
            items: [
              {
                label: 'Getting started',
                to: '/docs/tutorials/api-basics/create-fhir-data',
              },
              {
                label: 'Playing with Medplum',
                to: '/docs/tutorials',
              },
              {
                label: 'Documentation',
                to: '/docs',
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
                to: 'https://docs.medplum.com/storybook/index.html',
              },
              {
                label: 'GitHub',
                to: 'https://github.com/medplum/medplum',
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
                label: 'Services',
                to: '/services',
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
};

module.exports = config;
