# Epic Connection Demo Bot

The `epic-query-patient.ts` bot demonstrates how a Medplum Bot can authenticate and connect to an [Epic FHIR](https://fhir.epic.com/) server using backend JWT authentication. It showcases a common integration pattern: synchronizing Patient data between Medplum and Epic.

## Bot Behavior

This bot is designed to run with a Medplum `Patient` resource as its input. Its primary function is to ensure that the Patient exists in Epic and to synchronize key information between the two systems.

The bot determines its action based on whether the Medplum `Patient` resource already has an identifier linking it to an Epic patient record:

1.  **If no Epic identifier exists:** The bot creates a new `Patient` record in Epic using the Medplum patient's data. It then updates the Medplum `Patient` resource to include the identifier for the newly created Epic record.

2.  **If an Epic identifier exists:** The bot uses the identifier to fetch the latest patient data and related clinical information (such as allergies and medications) from Epic. It then updates the corresponding Medplum `Patient` resource and its associated data to reflect the information retrieved from Epic.

## Application Audience

Epic supports patient-facing applications, clinician-facing applications, and backend system applications. This bot is an **example of a backend system application**, where the Medplum bot connects directly to the FHIR server with no user-facing authentication flow. This requires appropriate configuration and access rights on the Epic FHIR server.

## Setting up the Epic FHIR Sandbox

To test this bot or develop your own Epic integration, you'll need access to Epic's developer sandbox environment. Here's how to set it up:

1.  **Register/Login:** Go to [https://fhir.epic.com/](https://fhir.epic.com/) and sign up for or log in to an Epic On FHIR developer account.
2.  **Create an App:** Navigate to the "Build Apps" section (or similar) and choose to create a new application.
3.  **Configure App Details:**
    - **App Name:** Choose a descriptive name (e.g., "Medplum Backend Integration").
    - **Application Audience:** Select **Backend Service**. This is crucial for server-to-server integrations like this bot, which use JWT client assertion and do not involve direct user interaction for authentication.
    - **Incoming APIs:** Select the FHIR resource types and interactions your application will need. For this bot, you would need at least `Patient` (read, create, search), `Organization` (read, search), `Practitioner` (read, search), `AllergyIntolerance` (read, search), `MedicationRequest` (read, search), and `Medication` (read, search). Ensure you select the **FHIR R4** versions of these APIs.
    - **Public Key:** You will need to generate an RSA key pair (e.g., using `openssl`). Upload the **public key** to the Epic application configuration. The corresponding **private key** will be used by the Medplum bot to sign the JWT assertion for authentication.
4.  **Save and Get Credentials:**
    - Copy the **Non-Production Client ID**. This is required by the bot.
    - Choose your SMART on FHIR version (Medplum uses R4).
    - Provide a brief summary for your app.
    - Accept the terms of use.
    - Save the application configuration (e.g., click **Save & Ready for Sandbox**).

## Bot Configuration Requirements

To run this bot within Medplum, you need to configure the following [Bot Secrets](https://www.medplum.com/docs/bots/bot-secrets):

- `EPIC_CLIENT_ID`: The **Non-Production Client ID** obtained from the Epic developer portal when setting up your application.
- `EPIC_PRIVATE_KEY`: The **private key** (in PEM format) corresponding to the public key you uploaded to the Epic application configuration.

The bot currently uses the following hardcoded URLs for the Epic sandbox environment:

- `baseUrl`: `https://fhir.epic.com/interconnect-fhir-oauth/`
- `tokenUrl`: `https://fhir.epic.com/interconnect-fhir-oauth/oauth2/token`
- `fhirUrlPath`: `api/FHIR/R4/`

These URLs might differ for specific hospital system production environments. A list of [EPIC FHIR endpoints](https://open.epic.com/MyApps/Endpoints) is available online, but you will typically get the correct URLs from the institution you are connecting to.

> [!IMPORTANT]
> Medplum examples use FHIR R4. Ensure your Epic application is configured for R4 APIs, and do not select STU3 or DSTU2 options.

## Tips and Known Issues

- **Private Key Formatting:** When adding the `EPIC_PRIVATE_KEY` secret in Medplum Project Secrets, ensure it is formatted correctly, including the header and footer, with newline characters represented as `\n`. For example: `-----BEGIN PRIVATE KEY-----\n<your-private-key-string>\n-----END PRIVATE KEY-----`. Incorrect formatting can lead to authentication failures.
- **Epic API Change Propagation:** If you modify the **Incoming APIs** settings for your application in the Epic developer portal (e.g., adding access to new FHIR resources), these changes might take some time (potentially up to an hour) to propagate through Epic's systems. During this period, requests involving the newly added APIs might fail. If you encounter unexpected errors after changing API permissions, wait a while and try again.

We recommend reading the official [Epic FHIR documentation](https://fhir.epic.com/Documentation?docId=developerguidelines) to fully understand the available FHIR APIs, configuration parameters, and specific requirements for a successful implementation.
