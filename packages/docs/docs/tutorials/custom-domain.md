# Hosting Medplum on a Custom Domain

In the previous guide, we set up [Medplum Hello World](/docs/tutorials/medplum-hello-world) on a local host. This guide will provide instructions on hosting your Medplum project on your own custom domain.

## Configuring Your Project

If you have only created the Medplum Hello World project, you will likely need to create a new project on Medplum. You can do so at https://app.medplum.com/register.

Once your project is set up, go to the [Medplum App](https://app.medplum.com). Click on `Project` on the sidebar or navigate to https://app.medplum.com/admin/project to access your Project Admin page. Click on the `Clients` tab.

This page should display your project memberships. Select your project and then click on the name of your project that links to the [`ClientApplication`](/docs/api/fhir/medplum/clientapplication) resource page. Alternatively, you can navigate to https://app.medplum.com/ClientApplication and select the `ClientApplication` for your project from that page.

You should now be on the resource page for your `ClientApplication`. Click on the `Edit` tab. From here you can change various details of your project. We are interested in the `Redirect URI` field.

The `Redirect URI` is the domain that your project will be redirected to when users sign in. Enter the domain that you wish to use for your project in this field.

To finish configuration, you will need the following identifiers, which we will go over how to obtain now:

- Google Client ID
- Google Client Secret
- reCAPTCHA Site Key
- reCAPTCHA Site Secret

### Google Client Identifiers

The Google Client ID and Client Secret allow your users to easily log in to your website with one click using Google accounts.

**Note: To create these keys you need to be signed into a Google account**

To create your Google Client ID and Client Secret, navigate to the Google Developer Console at https://console.developers.google.com/project. Click 'Create Project' and enter your project name and location. This will bring you to your project's dashboard.

On the left-side menu, click the `OAuth consent screen`. Choose your user type and click the create button. Fill out the available fields. App name should be the name of your website or app. User support email should be an email that users can reach out to for customer support. The domain should be where you want to deploy your app and the email address under Developer Contact Information should be your email address.

Once you have finished all the steps on the OAuth Consent screen, click the `Back to Dashboard` button to return to your project. From the dashboard click on `Credential` on the sidebar. Click `Create Credentials`, and select OAuth Client ID from the dropdown to create an OAuth Client ID.

From this page, choose web application from the `Application Type` dropdown and enter the name of your OAuth 2.0 client.

In the `Authorized JavaScript Origins` sections add a URI and enter your domain. For the `Authorized Redirect URIs` section, enter the URL you would like to users to be redirected to once they log in with Google. Once you have entered these, click `Create`.

A modal will appear with your Client ID and Client Secret. Copy these as you will need them to configure your app.

### reCAPTCHA Keys

Now that we have set up our project with Google, we can add reCAPTCHA functionality as well. First, we need to register our application and get a site key and private key pair.

Navigate to the Google reCAPTCHA admin console at https://www.google.com/recaptcha/admin/create. Click on the `+` icon to register a new site/application. Select reCAPTCHA v2 for your version and choose the option you would like to use to validate on your site. Recommended is `Invisible reCAPTCHA badge` which validates users in the background.

Once you have done this, you will receive a site key and a site secret, which you can copy to save for further use.

Next, add the domain of your site to the allowed domains list. If you are going to be using localhost for development, you should add this here as well.

### Finishing Configuration

Once you have your Google and reCAPTCHA keys, you can finish configuring your project on the [Medplum App](https://app.medplum.com). Return to the [Project Admin page](https://app.medplum.com/admin/project) and go to the `Sites` tab. Click on the green plus button to add a new domain to your project.

Under the domain field you will need to click the green plus button again to enter your domain. You can also enter the Google and reCAPTCHA keys in their corresponding fields. Once you have entered all of the details, click the Save button. Your project is now configured for a custom domain.

## Launching with Vercel

Once you have your identifiers configured, you are ready to launch your app. We recommend making an account on [Vercel](https://vercel.com).

Once you have created an account, from your Vercel dashboard, click the `Add New...` button and select `Project`. From here import the git repository with your project. Configure the project per your requirements and click `Deploy`.

To add your domain to the project, return to your dashboard and again click `Add New...`, this time selecting `Domain`. On this screen click `Add` then select your project and click `Continue`. Enter your domain and click `Add`. Some configuration may be required after this, but Vercel should walk you through it.

Once you have finished your domain configuration with Vercel, your app will be running on your custom domain!
