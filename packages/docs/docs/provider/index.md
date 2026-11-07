---
sidebar_position: 1
---

# Medplum Provider

The Medplum Provider is a user-facing web application for clinical users and operations teams. In this section, you can learn about different features of the Provider App and the workflows they enable.

![Medplum Provider App screenshot](/img/provider/medplum-provider-app-cover-image.webp)

Medplum Provider is built on the Medplum Platform and is [open source](https://github.com/medplum/medplum/tree/main/examples/medplum-provider). Depending on your organization’s needs, you can use Medplum Provider as your system of record, as a starting point, or as an implementation reference for your own custom electronic health record system.

## Building a Custom EHR

Beyond using the hosted app at [provider.medplum.com](http://provider.medplum.com), Medplum Provider is also a launching point for building your own custom EHR. You can fork it into a standalone repository that you own, host, and extend independently, while still connecting to a hosted or self-hosted Medplum server.

The fastest way to fork Medplum Provider is with the Medplum project initializer:

```bash
npm init medplum
```

You'll be prompted for a few options:

1. **Starter project** — select **Provider** (the default).
2. **Project name** — the directory and repository name for your new app.
3. **Medplum server URL** — your Medplum API URL (defaults to `https://api.medplum.com/`, or use `http://localhost:8103/` for a local server). This is written to the project's `.env` file.
4. **Create a GitHub repository** — optionally create a new GitHub repository and push to it in one step. This requires the [GitHub CLI](https://cli.github.com/) (`gh`), and you can choose whether the repository is private or public.

The initializer clones the standalone [`medplum-provider`](https://github.com/medplum/medplum-provider) repository, points it at your server, and initializes a fresh git history. Once it finishes:

```bash
cd <your-project-name>
npm run dev
```

Your forked app runs at `http://localhost:3001/` and resolves the `@medplum/*` packages from npm, so it builds and deploys on its own without the Medplum monorepo. From there you can customize pages, components, and workflows to fit your organization.

## Registering & Signing In

To use Medplum Provider, you'll need a Medplum account.

1. Register a new account and create a new Project on the Medplum App at [app.medplum.com](http://app.medplum.com)
2. Navigate to Medplum Provider at [provider.medplum.com](http://provider.medplum.com) and sign in with the same credentials
3. After signing in, review the "[Get Started](http://provider.medplum.com/getstarted)" page to import sample data and more

Occasionally, you may need to use the Medplum App for administrative and other tasks which we note explicitly in this documentation.

## Using Medplum Provider

The following sections outline the primary functionality of the Medplum Provider app.

#### [Adding Practitioners & Data](./provider/getting-started)

- [Adding Practitioners (via Medplum App)](./provider/getting-started#adding-practitioners)
- [Importing Data (via Medplum App)](./provider/getting-started#importing-data)

#### [Patient Profile](./provider/patient-profile)

- [Registering Patients](./provider/patient-profile#registering-patients)
- [Editing Patient Demographics](./provider/patient-profile#editing-patient-demographics)
- [Updating the Patient Summary Sidebar](./provider/patient-profile#updating-the-patient-summary-sidebar)

#### [Schedule](./provider/schedule#scheduling-a-visit)

- [Scheduling a Visit](./provider/schedule#scheduling-a-visit)
- [Setting Provider Availability](./provider/schedule#setting-provider-availability)

#### [Visits](./provider/visits)

- [Understanding Visits](./provider/visits#understanding-visits)
- [Documenting Visits](./provider/visits#documenting-visits)
- [Setting Up Care Templates (via Medplum App)](./provider/visits#setting-up-care-templates-via-medplum-app)

#### [Tasks](./provider/tasks)

- [Creating a Task](./provider/tasks#creating-a-task)
- [Updating a Task](./provider/tasks#updating-a-task)
- [Deleting a Task](./provider/tasks#deleting-a-task)
- [Adding a Task Note](./provider/tasks#adding-a-task-note)
- [Filtering Tasks](./provider/tasks#filtering-tasks)

#### [Spaces](./provider/spaces)

- [How Spaces Works](./provider/spaces#how-spaces-works)
- [Prerequisites](./provider/spaces#prerequisites)
- [The Agent Loop](./provider/spaces#the-agent-loop)
- [Customizing System Prompts](./provider/spaces#customizing-system-prompts)

#### Documentation Coming Soon:

- Messages
- Labs
- Medications
