// start-block customWelcomeEmails
import { BotEvent, getDisplayString, MedplumClient, ProfileResource } from '@medplum/core';
import { PasswordChangeRequest, ProjectMembership, Reference } from '@medplum/fhirtypes';

export async function handler(medplum: MedplumClient, event: BotEvent<ProjectMembership>): Promise<any> {
  // This Bot executes on every new ProjectMembership resource.
  // ProjectMembership is an administrative resource that connects a User and a Project.
  // ProjectMembership resources are only available to project administrators.
  // Therefore, this Bot must be configured as a project admin.
  const membership = event.input;

  // From the ProjectMembership, we can retrieve the user's profile.
  // Here, "profile" means FHIR profile: the FHIR resource that represents the user's identity.
  // In general, the profile will be a FHIR Patient or a FHIR Practitioner.
  const profile = await medplum.readReference(membership.profile as Reference<ProfileResource>);

  // Get the email from the profile.
  // Note that email is not a required field, so you may want to add
  // custom business logic for your unique circumstances.
  const email = profile.telecom?.find((c) => c.system === 'email')?.value as string;

  // When a new user registers or is invited to a project,
  // a PasswordChangeRequest resource is automatically created for initial account setup.
  // PasswordChangeRequest resources are readonly, and only available to project admins.
  const pcr = (await medplum.searchOne('PasswordChangeRequest', {
    _sort: '-_lastUpdated',
    user: membership.user?.reference as string,
  })) as PasswordChangeRequest;

  // Generate the setPasswordUrl based on the id and secret.
  // You will need to use these values in your application to confirm the user account.
  const setPasswordUrl = `https://example.com/setpassword/${pcr.id}/${pcr.secret}`;

  // Now we can send the email to the user.
  // This is a simple plain text email to the user.
  // Medplum supports sending HTML emails as well via the nodemailer API.
  // Learn more: https://nodemailer.com/extras/mailcomposer/
  await medplum.sendEmail({
    to: email,
    subject: 'Welcome to Example Health!',
    text: [
      `Hello ${getDisplayString(profile)}`,
      '',
      'Please click on the following link to create your account:',
      '',
      setPasswordUrl,
      '',
      'Thank you,',
      'Example Health',
      '',
    ].join('\n'),
  });

  return true;
}
// end-block customWelcomeEmails
