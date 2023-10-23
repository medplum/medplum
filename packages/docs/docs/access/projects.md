### Projects

Medplum [`Projects`](/docs/api/fhir/medplum/project) are the primary mechanism of access control. Projects are isolated containers of FHIR resources that are administered separately, and which can have different settings. 

Medplum [`Projects`](/docs/api/fhir/medplum/project) enable the following use cases:

- **Development vs. Production:** A common requirement for development teams to have a separate [`Project`](/docs/api/fhir/medplum/project) , with non-protected data, for testing and debugging purposes, before deploying workflow changes to production. A common Medplum usage pattern is to create a "development", "staging", and "production" [`Project`](/docs/api/fhir/medplum/project).

- **Multi-tenancy:** In [B2B2C environments](https://a16z.com/b2c2b-in-digital-health-a-founders-playbook/), a service provider may partner with multiple healthcare organizations to deliver care to patients. Each of [`Projects`](/docs/api/fhir/medplum/project) can provide each of these partners their own isolated environments, that have their own patient data, log-in flows, and project administrators. The [Medplum hosted service](/pricing) uses a multi-tenant instance of Medplum to service our hosted customers.

## Isolation Model

Medplum [`Projects`](/docs/api/fhir/medplum/project) create a hard boundary between FHIR resources. FHIR resources within one project cannot reference resources in another project. 

`Projects` each have their own user administration. A user can be a member of one, or multiple [`Projects`](/docs/api/fhir/medplum/project), with different privileges in each. See our [User Administration Guide]() for more information.

[`Projects`](/docs/api/fhir/medplum/project) can each be configured with own global settings and secrets (see [Project Settings](#settings) below).



### The SuperAdmin `Project` {#superadmin}

The main exception to this isolation model is the "Super Admin" project. This is a special project that provides a global view over all the resources on the Medplum server. **Logging into the Super Admin project allows for potential dangerous operations and is only intended for server administrators**. See our [SuperAdmin Guide]() for more information.

:::tip Server Shared resources

The Medplum server provides some read-only system level resources that are shared between projects, such as [`StructureDefinitions`]() and [`ValueSets`](). These resources *technically* cross the [`Project`](/docs/api/fhir/medplum/project) isolation boundary, most application developers will not have to interact these resources.

:::

## Creating a Project

#### Medplum App

* Visit the https://app.medplum.com/register or visit https://app.medplum.com/signin and click the "Register" link
* Sign in with an existing user, or enter the details for a new user account
* Enter your project name



## Project Settings {#settings}

You can find the full `Project` resource schema [here](/docs/api/fhir/medplum/project)

| Setting                      | Description                                                  | Default |
| ---------------------------- | ------------------------------------------------------------ | ------- |
| `superAdmin`                 | Whether this project is the super administrator project ([see above](#superadmin)). | `false` |
| `strictMode`                 | Whether this project uses strict FHIR validation, based on [FHIR profiles](/docs/fhir-datastore/profiles). | `true`  |
| `checkReferencesOnWrite`     | If `true`, the the server will reject create or write operations to a FHIR resource if it contains any invalid references. | `false` |
| `features`                   | A list of optional features that are enabled for the project. Allowed values are: <ul><li>`bots`: This[`Project`](/docs/api/fhir/medplum/project) is allowed to create and run bots ([Bots guide]()).</li><li>`email`: Bots in this project can [send emails](/docs/sdk/classes/MedplumClient#sendemail). </li><li>`cron`: This [`Project`](/docs/api/fhir/medplum/project) can run Bots on [CRON timers](https://www.medplum.com/docs/bots/bot-cron-job)</li><li>`google-auth-required`: If set, [Google authentication](/docs/auth/methods/google-auth) is the only method allowed for this [`Project`](/docs/api/fhir/medplum/project)</li></ul> |         |
| `defaultPatientAccessPolicy` | The default [`AccessPolicy`]() applied to all [Patient Users]() invited to this [`Project`](/docs/api/fhir/medplum/project). This is required to enable [open patient registration](/docs/auth/open-patient-registration). |         |



## Project Secrets

Each  [`Project`](/docs/api/fhir/medplum/project) can store a set of key/value pairs to store secrets, such as API keys, needed by Bots. See [Bot Secrets](/docs/bots/bot-secrets) for more information.

## Cloning and Expunging `Projects`

Self-hosted users have two advanced project administration operations available to them: 

* `$clone` - Make a copy of an existing [`Project`](/docs/api/fhir/medplum/project) and all its resources
* `$expunge` - Perform a "hard delete" of [`Project`](/docs/api/fhir/medplum/project) and all its resources. This will remove all the related resource rows from teh database.

For more information, refer to the [Super Admin Project Management guide](/docs/self-hosting/super-admin-cli#project-management)



## See Also

* [User management guide](/docs/auth/user-management-guide)
* [Super Admin Guide](/docs/self-hosting/super-admin-guide)
* [Super Admin CLI](/docs/self-hosting/super-admin-cli#project-management)
* [Project Resource Schema](/docs/api/fhir/medplum/project)
