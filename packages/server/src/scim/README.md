# Medplum SCIM

## Intro

The System for Cross-domain Identity Management (SCIM) is an open standard designed to simplify and automate the process of managing user identities across various applications and services. By leveraging SCIM, organizations can streamline user provisioning and de-provisioning, reduce manual administrative tasks, and improve overall security and compliance by ensuring consistent identity data across their IT ecosystem.

## Okta SCIM

Create an additional Okta application for SCIM. This is a separate application from the OIDC application.

:::note

As of February 2024, Okta does not support SCIM for custom OIDC apps, and therefore requires a separate SCIM application.

In the future, Okta may support SCIM for custom OIDC apps, in which case this step may not be necessary.

https://support.okta.com/help/s/article/configure-scim-for-a-custom-oidc-app?language=en_US

:::

### Create the SCIM application

1. Go to Okta Admin Console
2. Go to Applications
3. Click "Create App Integration"
4. Choose "SWA - Secure Web Authentication"
5. Click "Next"
6. Enter "Medplum SCIM" for the app name
7. Enter "https://app.medplum.com/" for the App login page URL
8. Update remaining fields as necessary
9. Click "Finish"

### Enable SCIM provisioning

1. Go to the newly created "Medplum SCIM" application
2. Go to the "General" tab
3. Click "Edit" next to "App Settings"
4. Click the checkbox for "Enable SCIM provisioning"
5. Click "Save"

### Enable SCIM provisioning actions

1. Go to the "Provisioning" tab
2. Click "Edit" next to "SCIM Connection"
3. Enter the following fields:
   1. SCIM Base URL: "https://api.medplum.com/scim/v2"
   2. Unique identifier field for users: "userName"
   3. Supported provisioning actions:
      1. Push New Users
      2. Push Profile Updates
      3. Import Groups (experimental)
   4. Username: Your Medplum client ID
   5. Password: Your Medplum client secret
4. (Optional) Click "Test API Credentials" to verify the connection
5. Click "Save"

### Configure SCIM actions

1. Go to the "Provisioning" tab
2. Click on the "To App" link in the left sidebar
3. Click "Edit" next to "Provisioning to App"
4. Enable "Create Users"
5. Enable "Update User Attributes"
6. Enable "Deactivate Users"
7. Click "Save"
