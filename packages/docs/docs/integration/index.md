# Integration

Medplum's integrations the most commonly used features of the platform, and the tools can be used to build effective robust integrations. Medplum supports three types of integrations:

- **First party** integrations with common medical systems
- **Common medical integrations** like FHIR, HL7 V2, SMART-on-FHIR and SFTP
- **Custom built** integrations using the SDK and Bot templates

## First Party Integrations

Medplum supports the following first party integrations.

<table>
  <thead>
    <tr>
      <th>Name</th>
      <th>Type</th>
      <th>Description</th>
      <th>Documentation</th>
    </tr>
  </thead>
  <tbody>
    <tr style={{backgroundColor: '#f6f8fa'}}>
      <td colspan="4"><strong>Authentication and Identity</strong></td>
    </tr>
    <tr>
      <td><a href="https://www.okta.com/">Okta</a></td>
      <td>Authentication</td>
      <td>Enable Okta SSO for Providers</td>
      <td><a href="/docs/auth/domain-level-identity-providers#okta-setup">Okta setup</a></td>
    </tr>
    <tr>
      <td><a href="https://auth0.com/">Auth0</a></td>
      <td>Authentication</td>
      <td>Enable Auth0 SSO for Providers and Patients</td>
      <td><a href="/docs/user-management/external-ids#invite-user">Auth0 account Setup</a></td>
    </tr>
    <tr>
      <td><a href="https://safety.google/authentication/">Google Authentication</a></td>
      <td>Authentication</td>
      <td>Enable Google SSO for Providers and Patients</td>
      <td><a href="/docs/auth/google-auth">Google Auth Setup</a></td>
    </tr>
    <tr>
      <td><a href="https://learn.microsoft.com/en-us/entra/identity-platform">Entra SSO</a> (fka Azure SSO)</td>
      <td>Authentication</td>
      <td>Enable Microsoft Entra SSO for Providers and Patients</td>
      <td><a href="/docs/auth/external-identity-providers">Entra Auth Setup</a></td>
    </tr>
    <tr>
      <td><a href="https://www.google.com/recaptcha/about/">Recaptcha</a></td>
      <td>Security</td>
      <td>Enable recaptcha on patient registration</td>
      <td><a href="/docs/user-management/custom-emails#setup-recaptcha">Setup recaptcha</a></td>
    </tr>
    <tr style={{backgroundColor: '#f6f8fa'}}>
      <td colspan="4"><strong>Clinical Systems (EHR, HIE, Labs)</strong></td>
    </tr>
    <tr>
      <td><a href="https://www.metriport.com/">Metriport</a></td>
      <td>HIE</td>
      <td>Nationwide patient record aggregation via CareQuality, CommonWell, and eHealth Exchange</td>
      <td><a href="https://docs.metriport.com/medical-api/getting-started/quickstart">Metriport Medical API</a></td>
    </tr>
    <tr>
      <td><a href="https://www.epic.com/">Epic Systems</a></td>
      <td>EHR</td>
      <td>Read/Write via FHIR API</td>
      <td><a href="https://github.com/medplum/medplum/tree/main/examples/medplum-demo-bots/src/epic">Epic JWT authentication</a></td>
    </tr>
    <tr>
      <td><a href="https://www.healthgorilla.com/">Health Gorilla Patient 360</a></td>
      <td>HIE</td>
      <td>Integrated records and ADT data</td>
      <td><a href="/docs/integration/health-gorilla">Health Gorilla Integration</a></td>
    </tr>
    <tr>
      <td><a href="https://zushealth.com/">Zus Health</a></td>
      <td>HIE</td>
      <td>Integrated HIE, analytics and longitudinal care</td>
      <td><a href="https://docs.zushealth.com/docs/medplum">Medplum integration</a></td>
    </tr>
    <tr>
      <td><a href="https://www.healthgorilla.com/">Health Gorilla Lab Network</a></td>
      <td>Diagnostics</td>
      <td>Lab orders and results</td>
      <td><a href="/docs/integration/health-gorilla">Health Gorilla Integration</a></td>
    </tr>
    <tr>
      <td><a href="https://www.labcorp.com/">Labcorp</a></td>
      <td>Diagnostics</td>
      <td>Lab orders and results</td>
      <td><a href="/docs/integration/health-gorilla">Bot and setup</a></td>
    </tr>
    <tr>
      <td><a href="https://www.questdiagnostics.com/">Quest</a></td>
      <td>Diagnostics</td>
      <td>Lab orders and results</td>
      <td><a href="https://github.com/medplum/medplum/tree/main/examples/medplum-health-gorilla-demo">Bot and setup</a></td>
    </tr>
    <tr style={{backgroundColor: '#f6f8fa'}}>
      <td colspan="4"><strong>Communications</strong></td>
    </tr>
    <tr>
      <td><a href="https://www.efax.com/">eFax</a></td>
      <td>Communications</td>
      <td>Send and receive faxes via FHIR Communication resources</td>
      <td><a href="/docs/integration/efax">eFax Integration</a></td>
    </tr>
    <tr style={{backgroundColor: '#f6f8fa'}}>
      <td colspan="4"><strong>Billing</strong></td>
    </tr>
    <tr>
      <td><a href="https://www.joincandidhealth.com/">Candid Health</a></td>
      <td>Billing</td>
      <td>Revenue cycle and insurance eligibility check</td>
      <td><a href="https://github.com/medplum/medplum/tree/main/examples/medplum-demo-bots/src/candid-health">Candid bot</a></td>
    </tr>
    <tr style={{backgroundColor: '#f6f8fa'}}>
      <td colspan="4"><strong>Data and Observability</strong></td>
    </tr>
    <tr>
      <td><a href="https://www.datadoghq.com/">Datadog</a></td>
      <td>Observability</td>
      <td>Application monitoring</td>
      <td><a href="/docs/self-hosting/datadog">Datadog sidecar setup</a></td>
    </tr>
    <tr>
      <td><a href="https://www.sumologic.com/">Sumo Logic</a></td>
      <td>Observability</td>
      <td>Application monitoring</td>
      <td>Coming soon</td>
    </tr>
    <tr>
      <td><a href="https://www.snowflake.com/">Snowflake</a></td>
      <td>Data warehouse</td>
      <td>Synchronize data to datawarehouse</td>
      <td>Documentation coming soon</td>
    </tr>
    <tr style={{backgroundColor: '#f6f8fa'}}>
      <td colspan="4"><strong>Artificial Intelligence</strong></td>
    </tr>
    <tr>
      <td><a href="https://www.openai.com/">OpenAI</a></td>
      <td>AI</td>
      <td>Large language models</td>
      <td><a href="/docs/ai">Medplum AI</a></td>
    </tr>
  </tbody>
</table>

## Common Medical Integrations

Medplum provides templates and playbooks for common medical integrations.

<table>
  <thead>
    <tr>
      <th>Name</th>
      <th>Type</th>
      <th>Description</th>
      <th>Documentation</th>
    </tr>
  </thead>
  <tbody>
    <tr style={{backgroundColor: '#f6f8fa'}}>
      <td colspan="4"><strong>Clinical and EHR Data</strong></td>
    </tr>
    <tr>
      <td>HL7 V2</td>
      <td>EHR</td>
      <td>Connect to ADT ORU or other HL7 Feeds</td>
      <td><a href="/docs/agent">On premise agent</a></td>
    </tr>
    <tr>
      <td>FHIR (g)(10)</td>
      <td>EHR</td>
      <td>FHIR API for other EHRs</td>
      <td>
        <a href="https://github.com/medplum/medplum/tree/main/examples/medplum-demo-bots/src/epic">Example bot FHIR API connectivity</a><br />
        <a href="/docs/cli/external-fhir-servers">CLI connector</a>
      </td>
    </tr>
    <tr>
      <td>SFTP</td>
      <td>EHR</td>
      <td>Synchronize data</td>
      <td><a href="/docs/bots/file-uploads#sftp-uploads">Example bot</a></td>
    </tr>
    <tr>
      <td>SMART-on-FHIR</td>
      <td>EHR</td>
      <td>SMART app launch from Medplum or another EHR</td>
      <td><a href="/docs/integration/smart-app-launch">SMART App Launch</a></td>
    </tr>
    <tr>
      <td>FHIRcast</td>
      <td>Radiology</td>
      <td>Event driven workflow for workstations</td>
      <td><a href="/docs/fhircast">Documentation</a></td>
    </tr>
    <tr style={{backgroundColor: '#f6f8fa'}}>
      <td colspan="4"><strong>Payor and Compliance</strong></td>
    </tr>
    <tr>
      <td>FHIR CMS 9115</td>
      <td>Payor</td>
      <td>FHIR Provider directory for Payor compliance</td>
      <td><a href="/docs/administration/provider-directory">Documentation</a></td>
    </tr>
    <tr>
      <td>BulkFHIR</td>
      <td>EHR/Payor</td>
      <td>Export FHIR Data for use by partners</td>
      <td><a href="/docs/api/fhir/operations/bulk-fhir">BulkFHIR documentation</a></td>
    </tr>
    <tr style={{backgroundColor: '#f6f8fa'}}>
      <td colspan="4"><strong>Identity and Authentication</strong></td>
    </tr>
    <tr>
      <td>OAuth2</td>
      <td>Identity</td>
      <td>Plug in any oAuth2 provider</td>
      <td><a href="/docs/auth/external-identity-providers">Documentation</a></td>
    </tr>
    <tr>
      <td>Basic Auth</td>
      <td>Identity</td>
      <td>Support connections via Basic Auth for legacy systems</td>
      <td><a href="/docs/sdk/core.medplumclient.setbasicauth">Basic auth</a></td>
    </tr>
    <tr style={{backgroundColor: '#f6f8fa'}}>
      <td colspan="4"><strong>Binary and Media</strong></td>
    </tr>
    <tr>
      <td>Video</td>
      <td>Binary Files</td>
      <td>Upload and transcode video</td>
      <td><a href="/docs/fhir-datastore/binary-data">Documentation</a></td>
    </tr>
    <tr>
      <td>PDF</td>
      <td>Binary Files</td>
      <td>Upload and access PDF</td>
      <td><a href="/docs/fhir-datastore/binary-data">Documentation</a></td>
    </tr>
    <tr>
      <td>Images</td>
      <td>Binary Files</td>
      <td>Upload and access image files</td>
      <td><a href="/docs/fhir-datastore/binary-data">Documentation</a></td>
    </tr>
  </tbody>
</table>

## Custom built integrations

Medplum provides building blocks for custom integrations. Some examples are below.

<table>
  <thead>
    <tr>
      <th>Name</th>
      <th>Template Type</th>
      <th>Description</th>
      <th>Documentation</th>
    </tr>
  </thead>
  <tbody>
    <tr style={{backgroundColor: '#f6f8fa'}}>
      <td colspan="4"><strong>Scheduling and Payments (Bot Webhooks)</strong></td>
    </tr>
    <tr>
      <td><a href="https://stripe.com/">Stripe</a></td>
      <td>Bot Webhooks</td>
      <td>Synchronize payments data</td>
      <td><a href="https://github.com/medplum/medplum/tree/main/examples/medplum-demo-bots/src/stripe-bots">Stripe bot</a></td>
    </tr>
    <tr>
      <td><a href="https://www.acuityscheduling.com/">Acuity Scheduling</a></td>
      <td>Bot Webhooks</td>
      <td>Enable third party scheduling</td>
      <td><a href="/docs/bots/consuming-webhooks">Consuming webhooks</a></td>
    </tr>
    <tr>
      <td><a href="https://cal.com/">Cal.com</a></td>
      <td>Bot Webhooks</td>
      <td>Enable third party scheduling</td>
      <td><a href="/docs/bots/consuming-webhooks">Consuming webhooks</a></td>
    </tr>
    <tr style={{backgroundColor: '#f6f8fa'}}>
      <td colspan="4"><strong>Clinical (API)</strong></td>
    </tr>
    <tr>
      <td>Medications</td>
      <td>API</td>
      <td>Prescribe and check medications</td>
      <td><a href="https://drive.google.com/drive/folders/1tkkKREaeCj8UOZErTHm28_y7jPfYn4Tb">Medication related integration</a></td>
    </tr>
    <tr style={{backgroundColor: '#f6f8fa'}}>
      <td colspan="4"><strong>Documents and Forms (Bot PDF)</strong></td>
    </tr>
    <tr>
      <td><a href="https://www.cms.gov/medicare/cms-forms/cms-forms/downloads/cms1500.pdf">CMS 1500</a></td>
      <td>Bot PDF</td>
      <td>Create PDF for CMS 1500</td>
      <td><a href="https://github.com/medplum/medplum/blob/main/examples/medplum-demo-bots/src/create-pdf.ts">PDF Bot</a></td>
    </tr>
    <tr>
      <td>Superbill</td>
      <td>Bot PDF</td>
      <td>Create PDF for Superbill</td>
      <td><a href="https://github.com/medplum/medplum/blob/main/examples/medplum-demo-bots/src/create-pdf.ts">PDF Bot</a></td>
    </tr>
  </tbody>
</table>

## Integration Building Blocks and Testing

Complex integrations are built by composing [bots](/docs/bots/), [subscriptions](/docs/subscriptions/index.md), [authentication and authorization](/docs/auth/index.md) and the [TypeScript SDK](/docs/sdk/).

- [Running on localhost](/docs/contributing/run-the-stack) is useful for testing integrations
- [CLI](/docs/cli/external-fhir-servers) is commonly used to test connectivity to external FHIR Servers
- [Integration Features and Fixes](https://github.com/medplum/medplum/pulls?q=is%3Apr+label%3Aintegration) on Github show the code that powers many of the integrations.
- [Audit and Logging Features](https://github.com/medplum/medplum/pulls?q=is%3Apr+label%3Aaudit-logging) show several security and observability integrations.
- [Bot Pull Requests](https://github.com/medplum/medplum/issues?q=label%3Abots) can be good reference material for how integrations work.
- [Auth Pull Requests](https://github.com/medplum/medplum/pulls?q=is%3Apr+label%3Aauth) can also be good reference material for integration planning and learning.

## Related

- [Epic Server to Server](https://youtu.be/E8VD9rgadG0) demo on Youtube
- [HL7 Handling using Bots](https://youtu.be/q0SXeb_8H2Q) on Youtube
