---
slug: post-install-verification
title: Post-Installation Steps to Verify Your Environment
authors:
  name: Reshma Khilnani
  title: Medplum Core Team
  url: https://github.com/reshmakh
  image_url: https://github.com/reshmakh.png
tags: [self-host]
---

# Medplum Post-Installation: Essential Steps to Verify Your Environment

This guide is for customers who are [self-hosting](/docs/self-hosting) Medplum, and this post assumes that your installation was complete and successful. We will refer to your base installation as `$domainName`, and this refers to the domain on which the Medplum app is running, for example on hosted Medplum the domain is `app.medplum.com.`

Now that the initial installation is complete, it's essential to verify that your environment is functioning correctly. In this article, we'll walk you through the necessary steps to ensure your Medplum installation is working.

The initial user created after you set up your account is referred to in this article as a **super admin**.

## Change Default Password

The first step after installation is to change the default password for your super admin account. Using the default password poses a security risk, as it's easily accessible to unauthorized users. To change the default password, log in to your instance of the [Medplum App](/docs/app) using the default credentials provided and navigate to the "Security" settings on the left sidebar (`$domainName/security` will be the URL). Update your password with a strong, unique combination of letters, numbers, and special characters.

Note your password and logout by clicking on the `Sign Out` item on the top right menu.

## Create a Medplum Project

A [Medplum Project](/docs/tutorials/register#medplum-projects) serves as a container for your [FHIR resources](/docs/api/fhir).

To create a new project, follow these steps:

- Navigate to the "Register" page in your Medplum app at `$domainName/register`.
- Fill out your name and email and create a password.
- Click the "Create account" button.
- Provide a name and description for your project.
- Click "Save" to create the project.

You will create a new (blank) Medplum project and be logged in.

## Invite a New User to the Project

Now that you are logged into your new project. Inviting a new user to your project is a great way to confirm that your email notifications are set up and install is working. To send an invitation:

- Click on the Admin -> Project item on your left navigation panel or visit `$domainName/admin/project`.
- Go to the "Users" tab within the project.
- Click the "Invite new user" link.
- Enter the user's email address, name and (optional) [Access Policy](/docs/access/access-policies).
  e. Click "Invite."

The new user should receive an email invitation to join the project. This process confirms that your system emails are functioning correctly.

You can see a visual on these steps [here](/docs/app/invite).

:::tip
There is a Medplum Project that is set up with the base installation called Super Admin. Members of this project will have super admin privileges and will be able to see all resources in all Projects. Log in with your super admin credentials and invite other users to the super admin projects as needed.
:::

## Create a FHIR Patient Resource

To test the core functionality of your Medplum installation, create a FHIR Patient resource within your project:

- Navigate to the "Patient Resources" page in your project on the left nav bar or by going to `$domainName/Patient`.
- Click "New" on top, or navigate to `$domainName/Patient/new`.
- Fill in the required fields for the patient.
- Click "Save" to create the FHIR Patient resource.

## Create, Deploy, and Execute a Medplum Bot

:::tip
Bots are not on by default for Medplum projects, to enable them login as super admin and navigate to the Projects page found here `$domainName/Patient/new`. Select the project you want to enable Bots for and add the following flag to the Project object:

```json
"features": [
  "bots"
]
```

Log out with your super admin account, and login with your user account.
:::

To confirm that AWS Lambda is correctly configured, create, deploy, and execute a Medplum Bot:

- Go to the "Bots" tab in your project in the Admin -> Project section or navigate to this url `$domainName/admin/bots`.
- Click "Create new bot" and provide the necessary details.
- Click "Create Bot" to create the bot.
- Navigate to the Bot on the `$domainName/Bot` page, click on the editor and save the boiler plate code.
- Deploy the bot by clicking "Deploy" in the editor window.
- Once the bot is deployed, click "Execute" to run it.

If the bot executes successfully, AWS Lambda is correctly configured in your environment.

## Check Log Files

Inspecting log files is crucial for identifying any errors or issues in your Medplum installation. Locate the log files in AWS Cloudwatch and confirm that you see [AuditEvent](/docs/api/fhir/resources/auditevent) resources appearing in the logs.

After following these steps, you can be confident that your Medplum environment is up and running. Remember to periodically check for updates and patches to ensure your system remains secure and efficient.
