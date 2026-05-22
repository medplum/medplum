# Hiive Build Patient And Provider App Deployment Plan

Last updated: 2026-05-20

## Purpose

Deploy `medplum-patient` and `medplum-provider` as first-party applications that use the existing CDK-deployed Hiive build Medplum backend and the FHIR data already loaded there.

The guiding principle is to stay Medplum-native: use Medplum projects, project sites, `ClientApplication` resources, `ProjectMembership` profiles, `AccessPolicy` resources, OAuth/SMART-compatible login flows, and FHIR R4 APIs. The frontend apps should never connect directly to the database or use a machine-to-machine integration account for human UI sessions.

## Current Environment

The deployed Medplum build environment is owned by `medplum-ubix` and deployed with CDK.

| Item | Value |
| --- | --- |
| AWS account | `476905305808` |
| AWS profile | `hiive-build` |
| AWS region | `us-east-1` |
| CloudFormation stack | `MedplumBuild` |
| Base domain | `ehr.hiivehealth.net` |
| Medplum admin app | `https://app.ehr.hiivehealth.net/` |
| Medplum API base | `https://api.ehr.hiivehealth.net/` |
| FHIR R4 base | `https://api.ehr.hiivehealth.net/fhir/R4/` |
| Storage base | `https://storage.ehr.hiivehealth.net/binary/` |
| Data project currently documented | `Ubix Data` |
| Data project ID currently documented | `7e472dfd-3ab9-4b75-adac-38e0c5c5d6c8` |

Before implementation, confirm that the synthetic/demo resources the apps should show are in the documented `Ubix Data` project. If they are in another Medplum project, use that project as the single source of truth for all values below.

Assumption for this plan: `Ubix Data` is the project-of-record and shared FHIR data source for both `medplum-patient` and `medplum-provider`. The apps should sign users into that project with human `ProjectMembership` records linked to `Patient` or `Practitioner` profiles. They should not use the existing `ubix-data` client-credentials account for browser-based patient or provider sessions.

## Official Medplum Standards Anchors

Implementation should be checked against official Medplum documentation before each major change. The standards that matter most for this rollout are:

- Medplum is FHIR-native and stores data as FHIR R4 resources. Patient and provider apps should use the Medplum FHIR API and SDK methods, not direct database access or app-local clinical stores. See [Medplum FHIR API](https://www.medplum.com/docs/api/fhir/) and [MedplumClient](https://www.medplum.com/docs/sdk/core.medplumclient).
- User-facing browser apps should use browser-based authentication. The `ubix-data` client credentials flow is for machine-to-machine access, not human patient/provider browser sessions. See [Authentication](https://www.medplum.com/docs/auth) and [Client Credentials](https://www.medplum.com/docs/auth/client-credentials).
- Medplum projects are the primary access-control and FHIR-resource isolation boundary. `Ubix Data` should remain the selected project unless validation proves the generated resources live elsewhere. See [Projects](https://www.medplum.com/docs/access/projects).
- Human access should be represented with `User` and `ProjectMembership` resources linked to `Patient` or `Practitioner` profiles. Project-scoped users are the preferred fit for real patients and practicing clinicians who primarily use one production project. See [Project vs Server Scoped Users](https://www.medplum.com/docs/user-management/project-vs-server-scoped-users).
- Access should be least-privilege and enforced with `AccessPolicy` resources, including patient-compartment restrictions and resource interaction lists. See [Access Policies](https://www.medplum.com/docs/access/access-policies).
- SMART scopes are supported by Medplum and should align with the app role, such as `patient/*.rs` for patient-facing reads and `user/*.cruds` only where provider workflows require broader clinical operations. See [SMART Scopes](https://www.medplum.com/docs/access/smart-scopes).
- Open patient registration should remain disabled until the project has a correct default patient access policy and an explicit account-linking strategy for generated patients. See [Open Patient Registration](https://www.medplum.com/docs/user-management/open-patient-registration).

## Deployment Safety And Existing Instance Protection

The patient and provider app work should not break the currently deployed Medplum instance if implementation stays additive.

Verified against the current CDK/config shape:

- `app.ehr.hiivehealth.net` is the existing Medplum admin app domain from `appDomainName`.
- `api.ehr.hiivehealth.net` is the existing Medplum API domain from `apiDomainName`.
- `storage.ehr.hiivehealth.net` is the existing Medplum storage domain from `storageDomainName`.
- The current CDK `FrontEnd` construct creates the admin app bucket/distribution from `appDomainName` only.
- There are no current `patient.ehr.hiivehealth.net` or `provider.ehr.hiivehealth.net` app resources in `medplum.build.config.json`.

Safety rules for implementation:

- Do not change `appDomainName`, `apiDomainName`, `baseUrl`, `storageDomainName`, or the existing admin app bucket/distribution as part of the patient/provider rollout.
- Do not upload patient or provider bundles to the `app.ehr.hiivehealth.net` bucket.
- Add new S3 buckets, CloudFront distributions, certificates, Route 53 records, and WAF associations for patient/provider hosting.
- Manage `patient.ehr.hiivehealth.net` and `provider.ehr.hiivehealth.net` DNS in this CDK deployment using the existing public Route 53 hosted zone for `ehr.hiivehealth.net`.
- Use unique CDK construct IDs for patient/provider hosting so CloudFormation creates new resources rather than replacing the existing `FrontEnd` resources.
- Add patient/provider domains to any required CORS or CSP allowlists as additional origins only; keep `app.ehr.hiivehealth.net` allowed.
- Review `cdk diff` before deployment and reject any change set that replaces or deletes existing API, admin app, storage, database, Redis, or DNS resources.

Expected safe CloudFormation changes are new resources plus additive policy/header/origin updates. Unsafe changes include replacement of the existing ECS service, RDS cluster, Redis cluster, `app.ehr.hiivehealth.net` S3 bucket, `app.ehr.hiivehealth.net` CloudFront distribution, API load balancer, or existing Route 53 records.

## Target State

Yes: the recommended public URLs are the sibling subdomains below. This keeps the existing Medplum admin app at `app.ehr.hiivehealth.net` and gives the two user-facing apps predictable first-party names under the same `ehr.hiivehealth.net` hosted zone.

| App | URL | Purpose |
| --- | --- | --- |
| Patient portal | `https://patient.ehr.hiivehealth.net/` | Patient-facing app based on Foo Medical |
| Provider portal | `https://provider.ehr.hiivehealth.net/` | Clinical/provider app based on Medplum Provider |
| Medplum admin app | `https://app.ehr.hiivehealth.net/` | Administrative console only |
| Medplum API | `https://api.ehr.hiivehealth.net/` | OAuth, FHIR, storage signing, app API |

Runtime flow:

1. Users open the patient or provider static app from CloudFront.
2. The React app creates a `MedplumClient` with `baseUrl: https://api.ehr.hiivehealth.net/`.
3. The app signs users in with Medplum React `SignInForm` using the target project ID and app-specific login settings.
4. Medplum authenticates the user and selects a `ProjectMembership` profile.
5. Patient users receive a `Patient` profile and access only their patient compartment.
6. Provider users receive a `Practitioner` profile and access the clinical workflows allowed by their access policy.
7. All app data access goes through Medplum FHIR search, read, create, update, GraphQL, and Medplum operations where the apps already use them.

## Medplum-Native Design Decisions

- Use one Medplum project for the shared demo data, users, client apps, access policies, and project site configuration.
- Treat the `Ubix Data` project as the shared data source unless validation proves the generated FHIR data is in a different project.
- Use `Project.site` entries for `patient.ehr.hiivehealth.net` and `provider.ehr.hiivehealth.net` so Medplum recognizes these as first-party project domains for authentication settings such as Google and reCAPTCHA.
- Create separate `ClientApplication` resources for the patient and provider apps. Use separate redirect URIs, allowed origins, app names, and default scopes so each app can be rotated or restricted independently.
- Use human `User` plus `ProjectMembership` records for UI login. The existing `ubix-data` client credentials account remains machine-to-machine only.
- Link each patient portal user to an existing `Patient` resource with a `ProjectMembership.profile`. Do not create duplicate patients if the person already exists in the generated FHIR data.
- Link each provider portal user to a `Practitioner` resource. Use `PractitionerRole`, `Schedule`, `Slot`, `CareTeam`, `Organization`, and `Location` resources where workflow needs exist.
- Use `AccessPolicy` for least privilege. The patient policy should be compartment-restricted to the logged-in patient. The provider policy should permit only the resource types and interactions the provider app needs.
- Keep the loaded clinical data as FHIR resources. Avoid custom app databases, direct RDS reads, or non-FHIR side channels for clinical data.
- Host the apps as static SPAs in AWS near the existing CDK stack rather than overwriting the Medplum admin app bucket.

## Current Implementation Status

As of 2026-05-20, Workstream 1, the Medplum-side portion of Workstream 2, Workstream 3, and the code/synth portion of Workstream 4 are complete.

| Item | Status | Notes |
| --- | --- | --- |
| Medplum API health | Verified | `https://api.ehr.hiivehealth.net/healthcheck` is healthy. |
| Data project | Verified | `Ubix Data`, project ID `7e472dfd-3ab9-4b75-adac-38e0c5c5d6c8`. |
| Project sites | Configured | Added `Hiive Patient App` and `Hiive Provider App` site entries. |
| Patient OAuth client | Created | `ClientApplication/b9cedb18-971b-489e-afbd-07fa429f66dd`. |
| Provider OAuth client | Created | `ClientApplication/ec23c2e3-f4e6-4aaf-9938-77506a367d4c`. |
| Patient access policy | Created | `AccessPolicy/ca3a5687-5a1a-4301-95b4-15a977ad29e4`. |
| Provider access policy | Created | `AccessPolicy/05fa99c3-6400-4d8c-af38-8b00b890315d`. |
| Browser client credentials policy | Created | `AccessPolicy/eabeb0e2-56c3-4d3d-8cea-41e6ec331b42`; assigned to both browser client app memberships to avoid broad client-credentials access. |
| Patient app config | Implemented | Uses `VITE_MEDPLUM_*` values with live Hiive defaults; build and focused test pass. |
| Provider app config | Implemented | Uses `VITE_MEDPLUM_*` values with live Hiive defaults; build and focused sign-in test pass. |
| Patient/provider CDK hosting | Implemented in code | `cdk synth` includes additive `PatientApp` and `ProviderApp` buckets, certificates, CloudFront distributions, WAFs, Route 53 records, and storage CORS origins. |

No browser client secrets were printed or stored during setup. The existing `ubix-data` client remains machine-to-machine only. Open patient registration remains disabled until default patient access policy assignment and generated-patient account-linking are explicitly approved.

AWS `cdk diff` and deploy are blocked because the local `hiive-build` AWS profile is not present in `~/.aws/config` and there are no default AWS credentials. Configure or locate the appropriate SSO profile before running live diff or deployment commands.

## Workstream 1: Confirm Data And Project Shape

1. Log in to `https://app.ehr.hiivehealth.net/` as an admin.
2. Confirm which project contains the generated Ubix/Hiive demo data.
3. Capture the final project ID for app config. The currently documented candidate is `7e472dfd-3ab9-4b75-adac-38e0c5c5d6c8`.
4. Run FHIR smoke checks against the chosen project:

```bash
curl https://api.ehr.hiivehealth.net/fhir/R4/Patient?_summary=count \
  -H "Authorization: Bearer <ADMIN_OR_PROJECT_TOKEN>" \
  -H "Content-Type: application/fhir+json"

curl https://api.ehr.hiivehealth.net/fhir/R4/Observation?_summary=count \
  -H "Authorization: Bearer <ADMIN_OR_PROJECT_TOKEN>" \
  -H "Content-Type: application/fhir+json"
```

5. Identify a small demo cohort for launch validation:
   - 3 to 5 patients with observations, medications, immunizations, care plans, messages, and appointments where available.
   - 1 to 3 practitioners with provider app access.
   - At least one schedule/service type compatible with the patient app `Get Care` workflow.

### Live Verification Result - 2026-05-20

The selected data project is verified as `Ubix Data` (`Project/7e472dfd-3ab9-4b75-adac-38e0c5c5d6c8`). Resource counts from the project are:

| Resource | Count |
| --- | ---: |
| `Patient` | 2588 |
| `Practitioner` | 116 |
| `PractitionerRole` | 70 |
| `Organization` | 55 |
| `Location` | 27 |
| `Encounter` | 2492 |
| `Observation` | 16705 |
| `DiagnosticReport` | 3125 |
| `MedicationRequest` | 705 |
| `Immunization` | 625 |
| `Questionnaire` | 13 |
| `QuestionnaireResponse` | 3080 |
| `Communication` | 157 |
| `Appointment` | 80 |
| `Task` | 1437 |

Known data gaps for app workflows: `Schedule`, `Slot`, `HealthcareService`, `CarePlan`, and `MedicationStatement` currently have zero records. Seed these as FHIR resources before validating scheduling, provider availability, care plan, or medication-history flows.

## Workstream 2: Configure Medplum Auth Resources

Create or update the following resources in the selected project.

### Project Sites

Add `Project.site` entries:

| Site name | Domains | Notes |
| --- | --- | --- |
| `Hiive Patient App` | `patient.ehr.hiivehealth.net` | Holds patient app Google and reCAPTCHA settings if those are enabled. |
| `Hiive Provider App` | `provider.ehr.hiivehealth.net` | Holds provider app Google settings if enabled. |

Live status: both entries are configured on `Project/7e472dfd-3ab9-4b75-adac-38e0c5c5d6c8`.

Email/password login can be used first if SES sandbox constraints make email verification awkward. If public patient registration is enabled, reCAPTCHA and verified email delivery must be configured before launch.

### Client Applications

Create two `ClientApplication` resources in the data project.

Patient app candidate:

```json
{
  "resourceType": "ClientApplication",
  "status": "active",
  "id": "b9cedb18-971b-489e-afbd-07fa429f66dd",
  "name": "Hiive Patient App",
  "description": "Patient-facing portal for the Hiive build environment",
  "redirectUris": [
    "https://patient.ehr.hiivehealth.net/",
    "https://patient.ehr.hiivehealth.net/signin",
    "http://127.0.0.1:5173/",
    "http://127.0.0.1:5173/signin",
    "http://localhost:5173/",
    "http://localhost:5173/signin"
  ],
  "allowedOrigin": [
    "https://patient.ehr.hiivehealth.net",
    "http://127.0.0.1:5173",
    "http://localhost:5173"
  ],
  "defaultScope": ["openid", "profile", "email", "fhirUser", "patient/*.rs", "offline_access"]
}
```

Provider app candidate:

```json
{
  "resourceType": "ClientApplication",
  "status": "active",
  "id": "ec23c2e3-f4e6-4aaf-9938-77506a367d4c",
  "name": "Hiive Provider App",
  "description": "Provider-facing portal for the Hiive build environment",
  "redirectUris": [
    "https://provider.ehr.hiivehealth.net/",
    "https://provider.ehr.hiivehealth.net/signin",
    "http://127.0.0.1:5172/",
    "http://127.0.0.1:5172/signin",
    "http://localhost:5172/",
    "http://localhost:5172/signin"
  ],
  "allowedOrigin": [
    "https://provider.ehr.hiivehealth.net",
    "http://127.0.0.1:5172",
    "http://localhost:5172"
  ],
  "defaultScope": ["openid", "profile", "email", "fhirUser", "user/*.cruds", "offline_access"]
}
```

Tighten scopes after the first working deployment. Medplum `AccessPolicy` should remain the authoritative least-privilege control for actual resource access.

### Access Policies

Create at least two access policies.

Patient access policy:

- Purpose: patient portal access for a single logged-in patient.
- Use `compartment` on the patient profile where possible.
- Permit read/search for patient-facing clinical resources such as `Patient`, `Observation`, `DiagnosticReport`, `MedicationRequest`, `MedicationStatement`, `Immunization`, `CarePlan`, `Questionnaire`, `QuestionnaireResponse`, `Communication`, `Appointment`, `Schedule`, `Slot`, `Practitioner`, `PractitionerRole`, `Organization`, and `Location`.
- Permit create/update only where the patient app needs it, such as `QuestionnaireResponse`, `Communication`, and appointment hold/book flows.

Provider access policy:

- Purpose: provider portal access for clinical users.
- Permit search/read for patient charts and supporting resources.
- Permit create/update for workflow resources the app uses, such as `Encounter`, `Condition`, `Observation`, `MedicationRequest`, `ServiceRequest`, `DiagnosticReport`, `Task`, `Communication`, `Appointment`, `Schedule`, and `Slot`.
- Permit read/search/history/vread for `ClientApplication` so timeline cards can resolve `meta.author` references from the `ubix-data` importer instead of rendering `[Forbidden]`.
- Permit read/search/history/vread for `EpisodeOfCare` so RTW and exposure case containers can be inspected from provider workflows.
- Do not grant admin-only resources unless a workflow explicitly requires them.

Live access policy IDs:

| Purpose | AccessPolicy ID | Notes |
| --- | --- | --- |
| Patient portal template | `ca3a5687-5a1a-4301-95b4-15a977ad29e4` | Uses Medplum's parameterized patient policy pattern with `%patient` and patient-compartment criteria. |
| Provider portal clinical access | `05fa99c3-6400-4d8c-af38-8b00b890315d` | Grants provider clinical workflow access without project/server administration resources. Includes read/search/history/vread for `ClientApplication` to display importer authors such as `ubix-data` in timelines, and read/search/history/vread for `EpisodeOfCare` to inspect RTW/exposure case containers. |
| Browser client credentials guardrail | `eabeb0e2-56c3-4d3d-8cea-41e6ec331b42` | Assigned to the patient/provider `ClientApplication` memberships so client-credentials tokens cannot inherit broad project access. |

### Users And Memberships

For initial validation, use invite-only accounts.

Do not use the Medplum admin bootstrap credentials for patient/provider app sign-in. Those credentials are only for server administration and setup. App users should authenticate as project-scoped `User` records with `ProjectMembership.profile` pointing to the appropriate `Patient` or `Practitioner`.

Because this environment does not have outbound invite email configured yet, demo logins were created through Medplum's admin invite endpoint with `sendEmail: false` and direct demo passwords. The generated passwords are stored only in the gitignored local file `hiive-build-demo-logins.local.md`.

Live demo login inventory:

| App | Email | Profile | Membership | Notes |
| --- | --- | --- | --- | --- |
| Patient | `ubix.patient.riley@example.com` | `Patient/5506b4b2-6557-4876-8367-7e398914bce4` | `ProjectMembership/48db19de-54cc-4233-8376-3739dcf3733d` | Riley Rivera; password verified; local app `http://127.0.0.1:5173/`. |
| Provider | `ubix.provider.alex@example.com` | `Practitioner/59ea2d1d-f436-437c-a785-74850bddbfd3` | `ProjectMembership/4e9c0e27-9cfa-4d6b-ac9a-275ae863b9da` | Alex Demo; password verified; imported practitioner profile has 44 assigned Tasks; local app `http://127.0.0.1:5172/`. |

Patient demo users:

- Create a `User` for each demo patient login.
- Create or reuse an existing `Patient` resource from the generated data.
- Add a `ProjectMembership` in the data project with `profile` pointing to that `Patient` and the patient access policy.

Provider demo users:

- Create a `User` for each provider login.
- Create or reuse a `Practitioner` resource.
- Add a `ProjectMembership` in the data project with `profile` pointing to that `Practitioner` and the provider access policy.

## Workstream 3: Update App Configuration

Both apps should be environment-driven and point to the Hiive Medplum API at build time.

Local Vite dev servers use same-origin proxies for Medplum API paths (`/auth`, `/oauth2`, `/fhir`, `/admin`, and related endpoints) so Simple Browser testing does not hit browser CORS preflight failures. Deployed browser origins are covered by `MEDPLUM_ALLOWED_ORIGINS` in `medplum.build.config.json`.

Shared build-time variables:

```bash
VITE_MEDPLUM_BASE_URL=https://api.ehr.hiivehealth.net/
VITE_MEDPLUM_PROJECT_ID=<DATA_PROJECT_ID>
VITE_MEDPLUM_GOOGLE_CLIENT_ID=<OPTIONAL_GOOGLE_CLIENT_ID>
VITE_MEDPLUM_RECAPTCHA_SITE_KEY=<OPTIONAL_RECAPTCHA_SITE_KEY>
```

Patient app changes in `medplum-patient`:

- Replace hardcoded `MEDPLUM_PROJECT_ID`, Google client ID, and reCAPTCHA constants with `import.meta.env` values and sensible local defaults.
- Add `baseUrl: import.meta.env.VITE_MEDPLUM_BASE_URL || undefined` to the `MedplumClient` constructor in `src/main.tsx`.
- Pass the selected project ID to `SignInForm` and `RegisterForm`.
- Prefer `resourceType="Patient"` on patient sign-in/registration flows so profile selection stays patient-specific.
- Decide whether registration is enabled. For demo data consumption, invite-only is safer because it links users to existing generated `Patient` records.
- Remove or disable any sample-data bootstrap behavior that would create Foo Medical demo data if it conflicts with the generated Hiive/Ubix resources.

Provider app changes in `medplum-provider`:

- Keep the existing `VITE_MEDPLUM_BASE_URL` support in `src/main.tsx`.
- Update `SignInPage` to read project ID, Google client ID, and optional client ID from env instead of hardcoded sample values.
- Prefer `resourceType="Practitioner"` for provider login.
- Preserve Medplum React and FHIR/GraphQL access patterns. Do not introduce separate backend API calls for clinical data.

Live status: implemented. The patient app and provider app now default to `https://api.ehr.hiivehealth.net/`, `Project/7e472dfd-3ab9-4b75-adac-38e0c5c5d6c8`, and their app-specific `ClientApplication` IDs while allowing deployment-time overrides through `.env.example` / `VITE_MEDPLUM_*` values. Production builds pass for both apps. Focused tests pass for `medplum-patient` `App.test.tsx` and `medplum-provider` `SignInPage.test.tsx`.

## Workstream 4: Add Static Hosting To CDK

Do not reuse or overwrite `app.ehr.hiivehealth.net`; that is the Medplum admin app site. Add separate static hosting for the patient and provider SPAs.

Recommended CDK approach in `medplum-ubix`:

1. Add a reusable static SPA construct based on the existing `FrontEnd` pattern:
    - Private S3 bucket per app.
    - CloudFront distribution per app.
    - ACM certificate in `us-east-1`.
    - Route 53 alias record in the existing public `ehr.hiivehealth.net` hosted zone.
    - DNS validation for any CDK-managed certificates, or explicitly configured certificate ARNs if certificates are created separately.
    - WAF protection consistent with the existing app distribution.
    - SPA fallback from 403/404 to `/index.html`.
    - Response headers policy with CSP allowing `api.ehr.hiivehealth.net`, `storage.ehr.hiivehealth.net`, Google auth endpoints if used, and Medplum assets required by the app.
    - Unique construct IDs and bucket names so the existing `app.ehr.hiivehealth.net` admin app distribution is not replaced.
2. Add config entries for:
   - `patientAppDomainName`: `patient.ehr.hiivehealth.net`
   - `providerAppDomainName`: `provider.ehr.hiivehealth.net`
   - patient/provider app certificate ARNs or CDK-managed certificates
   - optional logging buckets/prefixes
3. Add patient/provider origins to storage CORS only if the apps need direct browser access to `storage.ehr.hiivehealth.net` binary URLs. Keep the existing `app.ehr.hiivehealth.net` origin.
4. Run a diff before deploying. Proceed only if the change set is additive for patient/provider hosting and does not replace the existing Medplum API, admin app, storage, database, Redis, or Route 53 records:

```bash
AWS_PROFILE=hiive-build AWS_SDK_LOAD_CONFIG=1 npx cdk diff -c config=medplum.build.config.json
```

Live status: CDK code is implemented and `AWS_SDK_LOAD_CONFIG=1 npx cdk synth -c config=medplum.build.config.json` succeeds. The synthesized template includes new `PatientApp` and `ProviderApp` S3 buckets, ACM certificates, CloudFront distributions, WAFs, Route 53 alias records, and storage CORS origins. `cdk diff` is still blocked by missing local AWS credentials/profile.

5. Deploy the infrastructure through the existing AWS profile:

```bash
AWS_PROFILE=hiive-build AWS_SDK_LOAD_CONFIG=1 npx cdk synth -c config=medplum.build.config.json
AWS_PROFILE=hiive-build AWS_SDK_LOAD_CONFIG=1 npx cdk deploy -c config=medplum.build.config.json --require-approval never
```

6. Add upload scripts or CI jobs for app assets:

```bash
cd ../medplum-patient
VITE_MEDPLUM_BASE_URL=https://api.ehr.hiivehealth.net/ \
VITE_MEDPLUM_PROJECT_ID=<DATA_PROJECT_ID> \
npm run build
aws s3 sync dist s3://patient.ehr.hiivehealth.net/ --delete
aws cloudfront create-invalidation --distribution-id <PATIENT_DISTRIBUTION_ID> --paths "/*"

cd ../medplum-provider
VITE_MEDPLUM_BASE_URL=https://api.ehr.hiivehealth.net/ \
VITE_MEDPLUM_PROJECT_ID=<DATA_PROJECT_ID> \
npm run build
aws s3 sync dist s3://provider.ehr.hiivehealth.net/ --delete
aws cloudfront create-invalidation --distribution-id <PROVIDER_DISTRIBUTION_ID> --paths "/*"
```

If speed matters more than AWS ownership for an early preview, Vercel can host the static apps temporarily. The final production path should still be CDK-owned AWS hosting beside the existing Medplum deployment so DNS, WAF, certificates, audit, and operations stay in one place.

## Workstream 5: Data Readiness For App Workflows

The apps will only feel correct if the generated FHIR data includes the resources their screens already search for.

Patient app readiness:

- `Patient` profile for the logged-in user.
- `Observation` resources for vitals and measurements.
- `DiagnosticReport` and related `Observation` resources for lab results.
- `MedicationRequest` or `MedicationStatement` resources for medications.
- `Immunization` resources for vaccines.
- `CarePlan` resources for care plan/action item screens.
- `Questionnaire` resources for intake and screening.
- `QuestionnaireResponse` write permissions.
- `Communication` resources and write permissions for messaging.
- `Schedule`, `Slot`, `HealthcareService`, `Practitioner`, and `Appointment` resources for the `Get Care` flow.

Provider app readiness:

- Searchable `Patient` resources with enough demographics for chart selection.
- Patient-linked clinical resources for chart tabs.
- `Practitioner` profiles for provider users.
- `PractitionerRole`, `Organization`, and `Location` for scheduling and care team context.
- `Encounter` resources or permissions to create them.
- `Task`, `Communication`, `ServiceRequest`, `DiagnosticReport`, and `Appointment` resources for operational workflows.

Where generated data lacks a resource family, fill the gap with FHIR seed bundles or Medplum Bots. Prefer bundles and bots over app-local mock data.

## Workstream 6: Verification And Acceptance

Backend checks:

- `https://api.ehr.hiivehealth.net/healthcheck` returns healthy.
- `/.well-known/openid-configuration` advertises the expected issuer and OAuth endpoints.
- FHIR count searches return expected resource counts in the selected project.

Auth checks:

- Patient demo user signs in at `https://patient.ehr.hiivehealth.net/`.
- Patient user profile is a `Patient` resource.
- Patient user cannot search or read another patient record.
- Provider demo user signs in at `https://provider.ehr.hiivehealth.net/`.
- Provider user profile is a `Practitioner` resource.
- Provider user can search and open the demo patient cohort.

App checks:

- Patient app health record pages render real FHIR resources from `api.ehr.hiivehealth.net`.
- Patient app can create a questionnaire response or message if those features are enabled.
- Provider app can search patients, open a chart, view timeline/resources, and create/update one low-risk workflow resource in a test patient chart.
- Browser network traffic only calls the static app domain, `api.ehr.hiivehealth.net`, expected storage URLs, and approved identity provider domains.

Infrastructure checks:

- Both apps serve over HTTPS with valid certificates.
- Deep links and refreshes route back to `index.html`.
- CloudFront invalidation updates deployed content.
- WAF and response headers are active.
- No changes break `https://app.ehr.hiivehealth.net/`.

## Recommended Implementation Sequence

1. Confirm the data project and demo cohort.
2. Create patient/provider access policies.
3. Create patient/provider project site entries.
4. Create patient/provider `ClientApplication` resources.
5. Create invite-only demo patient and provider memberships.
6. Update app env config and sign-in configuration.
7. Build both apps locally against `https://api.ehr.hiivehealth.net/` and smoke test with the demo users.
8. Add patient/provider static hosting to CDK.
9. Deploy CDK infrastructure.
10. Upload patient/provider app bundles and invalidate CloudFront.
11. Run acceptance checks.
12. Document final client IDs, domains, distribution IDs, bucket names, and demo accounts in the operational handoff docs. Do not store live secrets in Git.

## Open Decisions

| Decision | Recommendation |
| --- | --- |
| Final domains | Use `patient.ehr.hiivehealth.net` and `provider.ehr.hiivehealth.net`. |
| Data project | Use the project that contains the generated FHIR data; current documented candidate is `Ubix Data`. |
| Patient registration | Start invite-only to avoid duplicate patient records; add self-registration only after an account-linking story is defined. |
| Identity provider | Start with email/password for speed; add Google once project site settings and OAuth consent are ready. |
| Hosting | Use CDK-managed S3 + CloudFront for final deployment. |
| Access model depth | Start with two clear policies, then split provider policies by role if workflows require it. |
| Demo data gaps | Fill with FHIR bundles or Bots, not app-local mock data. |

## Related Docs

- `hiive-build-deployment.md`
- `hiive-build-deployment-non-technical.md`
- `ubix-data-handoff.md`
- `ubix-data-admin-secret-retrieval.md`