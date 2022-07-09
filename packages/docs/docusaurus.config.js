// @ts-check
// Note: type annotations allow type checking and IDEs autocompletion

const lightCodeTheme = require('prism-react-renderer/themes/github');
const darkCodeTheme = require('prism-react-renderer/themes/dracula');

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: 'Medplum',
  tagline: 'Healthcare infrastructure and application development',
  url: 'https://docs.medplum.com',
  baseUrl: '/',
  trailingSlash: false,
  onBrokenLinks: 'error',
  onBrokenMarkdownLinks: 'error',
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
          routeBasePath: '/',
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
            to: '/tutorials',
            label: 'Tutorials',
            position: 'left',
          },
          {
            to: '/api',
            label: 'API',
            position: 'left',
          },
          {
            to: '/contributing',
            label: 'Contributing',
            position: 'left',
          },
          {
            to: '/blog',
            label: 'Blog',
            position: 'left',
          },
          {
            href: 'https://github.com/medplum/medplum',
            label: 'GitHub',
            position: 'right',
          },
        ],
      },
      footer: {
        style: 'dark',
        links: [
          {
            title: 'Docs',
            items: [
              {
                label: 'Tutorial',
                to: '/tutorials',
              },
            ],
          },
          {
            title: 'Community',
            items: [
              {
                label: 'Stack Overflow',
                href: 'https://stackoverflow.com/questions/tagged/medplum',
              },
              {
                label: 'Discord',
                href: 'https://discord.gg/UBAWwvrVeN',
              },
              {
                label: 'Storybook',
                href: 'https://docs.medplum.com/storybook/index.html',
              },
            ],
          },
          {
            title: 'More',
            items: [
              {
                label: 'Blog',
                to: '/blog',
              },
              {
                label: 'GitHub',
                href: 'https://github.com/medplum/medplum',
              },
            ],
          },
        ],
        copyright: `Copyright © ${new Date().getFullYear()} Medplum, Inc.`,
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
