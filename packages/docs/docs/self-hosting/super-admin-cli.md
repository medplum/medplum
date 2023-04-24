---
sidebar_position: 7
---

# Super Admin CLI

Medplum includes a CLI (Command Line Interface).

The main docs for the CLI are available here: https://github.com/medplum/medplum/blob/main/packages/cli/README.md

## Installation

As described in the docs, you can install globally:

```bash
npm install --global @medplum/cli
```

Or add as a package dependency:

```bash
npm install @medplum/cli
```

This document assumes that the CLI is installed globally, and therefore can be run simply as `medplum`.

If you install it as a package dependency, then you will need to prefix with `npx` such as `npx medplum`.

## Base URL

By default, the Medplum CLI connects to the Medplum hosted API at https://api.medplum.com/

You can use the `MEDPLUM_BASE_URL` to connect to your own hosted servers.

Check the current value:

```bash
echo $MEDPLUM_BASE_URL
```

Set a new value:

```bash
export MEDPLUM_BASE_URL=https://api.medplum.example.com
```

## Authentication

Use one of these authentication options:

1. Stored credentials in `~/.medplum/credentials`. You can use the `medplum login` command (see below) to automatically create this file.
2. Client credentials in environment variables `MEDPLUM_CLIENT_ID` and `MEDPLUM_CLIENT_SECRET`. dotenv is enabled, so you can store them in a .env file.

Check if logged in:

```bash
medplum whoami
```

Start a new login:

```bash
medplum login
```

Verify that the login worked:

```bash
medplum whoami
```

## User Management

The Medplum CLI supports RESTful CRUD operations. We can use that functionality to perform basic user management.

List users:

```bash
medplum get User
```

Search user by email:

```bash
medplum get User?email=fred@example.com
```

Get a user by ID

```bash
medplum get User/47394216-2bd5-445a-ad3c-b205bb56a0dc
```

The syntax of the last argument is either a FHIR resource/id or a FHIR search. All FHIR search parameters are supported in the CLI.

## Project Management

Similar to User Management, the CLI can use RESTful CRUD operations to perform basic project management.

List projects

```bash
medplum get Project
```

Search for project by name:

```bash
medplum get Project?name=staging
```

Get a project by ID:

```bash
medplum get Project/f4d16028-3de1-4473-bf66-899461b658c6
```

Projects also have special "operations". The URL syntax follows the FHIR operation model.

Use the $clone operation to clone a project:

```bash
medplum post 'Project/bca80725-ea6a-4fb4-8eac-41b8ee51f09e/$clone'
```

Cloning a project with a new name

To clone a project with a new name, you can use the name parameter in the POST body. The name parameter is a string value that specifies the name of the new project. Here's an example:

```bash
medplum post 'Project/bca80725-ea6a-4fb4-8eac-41b8ee51f09e/$clone' '{"name": "New Project Name"}'
```

Cloning a project for allowed resource types

To clone a project and only include certain resource types, you can use the resourceTypes parameter in the POST body. The resourceTypes parameter is an array of strings that specifies the allowed resource types in the new project.

```bash
medplum post 'Project/bca80725-ea6a-4fb4-8eac-41b8ee51f09e/$clone' '{"resourceTypes": ["Patient"]}'
```

Cloning a project to include resource ids

To clone a project and include specific resource ids, you can use the includeIds parameter in the POST body. The includeIds parameter is an array of strings that specifies the resource ids to include in the new project.

```bash
medplum post 'Project/bca80725-ea6a-4fb4-8eac-41b8ee51f09e/$clone' '{"includeIds": ["bca80725-ea6a-4fb4-8eac-41b8ee51f09e"]}'
```

Cloning a project to exclude resource ids

To clone a project and exclude specific resource ids, you can use the excludeIds parameter in the POST body. The excludeIds parameter is an array of strings that specifies the resource ids to exclude from the new project.

```bash
medplum post 'Project/bca80725-ea6a-4fb4-8eac-41b8ee51f09e/$clone' '{"excludeIds": ["bca80725-ea6a-4fb4-8eac-41b8ee51f09e"]}'
```

:::tip

Note that "$" is a special character in Bash for variable interpolation. Wrap the full string in single quotes to avoid interpolation, or escape the $ with a backslash.

:::

The result of the clone operation will be the new Project JSON:

```json
{
  "resourceType": "Project",
  "name": "My Project",
  "id": "cabd683a-dc09-492f-a513-416c6f3c16bd",
  "meta": {
    "versionId": "a9ce32d9-c609-4814-bb67-59f3ea8b5d38",
    "lastUpdated": "2023-03-15T18:50:49.882Z"
  }
}
```

:::caution Note

The $clone operation to clone a project has a limit of cloning `1000` resources per resource type.

:::

You can now add users to the new project using the admin invite endpoint to invite a user. The invite endpoint will use an existing User if one already exists with the specified email address. Otherwise, a new User will be created.

```bash
medplum post admin/projects/cabd683a-dc09-492f-a513-416c6f3c16bd/invite '{ \
    "resourceType": "Practitioner", \
    "firstName": "Bob", \
    "lastName": "Jones", \
    "email": "bob@example.com" \
}'
```

Expunge a project completely:

:::danger

This command permanently deletes all data in the project. This is irreversible. This is the equivalent of `sudo rm -rf`, so please use extreme caution.

:::

```bash
medplum post 'Project/bca80725-ea6a-4fb4-8eac-41b8ee51f09e/$expunge'
```
