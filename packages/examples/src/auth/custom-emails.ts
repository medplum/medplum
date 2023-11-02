// start-block customEmails
import { BotEvent, getDisplayString, getReferenceString, MedplumClient, ProfileResource } from '@medplum/core';
import { PasswordChangeRequest, ProjectMembership, Reference, User } from '@medplum/fhirtypes';

export async function handler(medplum: MedplumClient, event: BotEvent<PasswordChangeRequest>): Promise<any> {
  // This Bot executes on every new PasswordChangeRequest resource.
  // PasswordChangeRequest resources are created when a new user registers or is invited to a project.
  // PasswordChangeRequest resources are only available to project administrators.
  // Therefore, this Bot must be configured as a project admin.
  const pcr = event.input;

  // Get the user from the PasswordChangeRequest.
  const user = await medplum.readReference(pcr.user as Reference<User>);

  // Get the project membership for the user.
  // ProjectMembership is an administrative resource that connects a User and a Project.
  const membership = (await medplum.searchOne('ProjectMembership', {
    user: getReferenceString(user),
  })) as ProjectMembership;

  // From the ProjectMembership, we can retrieve the user's profile.
  // Here, "profile" means FHIR profile: the FHIR resource that represents the user's identity.
  // In general, the profile will be a FHIR Patient or a FHIR Practitioner.
  const profile = await medplum.readReference(membership.profile as Reference<ProfileResource>);

  // Get the email from the user.
  const email = user.email as string;

  // Generate the setPasswordUrl based on the id and secret.
  // You will need to use these values in your application to confirm the user account.
  const setPasswordUrl = `https://example.com/setpassword/${pcr.id}/${pcr.secret}`;

  // Now we can send the email to the user.
  // This is a simple plain text email to the user.
  // Medplum supports sending HTML emails as well via the nodemailer API.
  // Learn more: https://nodemailer.com/extras/mailcomposer/

  if (pcr.type === 'invite') {
    // This PasswordChangeRequest was created as part of a new user invite flow.
    // Send a Welcome email to the user.
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
  } else {
    // This PasswordChangeRequest was created as part of a password reset flow.
    // Send a Password Reset email to the user.
    await medplum.sendEmail({
      to: email,
      subject: 'Example Health Password Reset',
      text: [
        `Hello ${getDisplayString(profile)}`,
        '',
        'Someone requested to reset your Example Health password.',
        '',
        'To reset your password, please click on the following link:',
        '',
        setPasswordUrl,
        '',
        'If you received this in error, you can safely ignore it.',
        '',
        'Thank you,',
        'Example Health',
        '',
      ].join('\n'),
    });
  }

  return true;
}
// end-block customEmails
