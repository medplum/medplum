---
sidebar_position: 1
---

# Account Setup

:::caution[Beta]
The ScriptSure integration is in beta. Features and APIs may change.
:::

This guide walks through completing your ScriptSure account setup after Medplum has provisioned your organization.

## 1. Accept the invite and complete sign-up

You'll receive an invite email from ScriptSure–To add the first user, Medplum will initiate, but after this, Admin users can invite new users. Click the link and complete the registration flow: Eligibility, User, Password, and Identification.

**Staging credentials:**

- Staging portal: [spu.scriptsure.com](https://spu.scriptsure.com/)

:::note[Staging only: test NPI / DEA / license numbers]
These credentials can just be placeholder values in Staging. To quickly get correctly formatted credentials, you can generate them with the following prompt to an LLM:
```
Can you create an example NPI for <full_name> in <your_state>. Please include a State Medical License Number and DEA as well.
```
When prompted for ID.me verification in staging, use:
- Email: `vendors@dawsystems.com`
- Password: `DAWVendor1!`

A two-factor code will be pre-populated for you.
:::

## 2. Configure your Medplum ProjectMembership

After completing sign-up, your ScriptSure user ID must be linked to your Medplum `ProjectMembership`.

1. Open your `ProjectMembership` in the Medplum app.
2. Add an identifier entry with:

| Field | Value |
|---|---|
| `system` | `https://spa.scriptsure.com` (staging) |
| `value` | Your ScriptSure user ID (visible in the portal under the Users tab) |

## 3. Update your Practitioner email

1. Open your `Practitioner` resource in Medplum.
2. Set the email telecom to match the email address you used when signing up for ScriptSure.

## 4. Verify the iFrame loads

1. Open [provider.medplum.com](https://provider.medplum.com) and navigate to a patient.
2. Click the **ScriptSure** tab.
3. Confirm the ScriptSure prescribing UI appears.

## Adding additional admin users

Once you have admin access, you can add other users to your ScriptSure organization:

1. Log in to [spu.scriptsure.com](https://spu.scriptsure.com) (staging).
2. Navigate to your practice.
3. Select **Add User** and choose **Provider**.
4. Enter the user's name and email. Grant **Full Administrator** access if you'd like this user to be an admin.
5. Submit and acknowledge the confirmation dialog (you can ignore the "trigger a charge" alert for staging).
6. Once the new user accepts their invite, they can be designated as a prescriber or admin in the portal.
