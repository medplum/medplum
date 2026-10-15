# Medplum Docs

An exploration into migrating Medplum docs from Docusaurus to Hugo.

## Folders

| Folder        | Description                              | Built? | Included in output? |
| ------------- | ---------------------------------------- | ------ | ------------------- |
| `archetypes/` | Content archetypes for new pages.        | Yes    | No                  |
| `assets/`     | Assets that will be built into the site. | Yes    | Yes                 |
| `content/`    | Markdown files for documentation pages.  | Yes    | Yes                 |
| `data/`       | Data files for site configuration.       | Yes    | No                  |
| `i18n/`       | Internationalization files.              | Yes    | No                  |
| `layouts/`    | Custom layouts and templates.            | Yes    | Yes                 |
| `static/`     | Static files served as-is.               | No     | Yes                 |

Layout types

| Layout Type  | Convention? | Description                             |
| ------------ | ----------- | --------------------------------------- |
| `_default`   | Mandated    | Default layout for documentation pages. |
| `_markup`    | Mandated    | Layout for rendering markdown content.  |
| `partials`   | Mandated    | Reusable partial templates.             |
| `shortcodes` | Mandated    | Custom shortcodes for markdown files.   |
