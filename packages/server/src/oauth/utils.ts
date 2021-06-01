import { ClientApplication, Login, User } from '@medplum/core';
import { allOk, badRequest, notFound, repo, RepositoryResult } from '../fhir';
import { Operator } from '../fhir/search';
import bcrypt from 'bcrypt';

/**
 * Searches for user by email.
 * @param email
 * @return
 */
export async function getUserByEmail(email: string): RepositoryResult<User | undefined> {
  const [outcome, bundle] = await repo.search({
    resourceType: 'User',
    filters: [{
      code: 'email',
      operator: Operator.EQUALS,
      value: email
    }]
  });

  if (outcome.id !== 'allok') {
    return [outcome, undefined];
  }

  if (!bundle?.entry || bundle.entry.length === 0) {
    return [notFound, undefined];
  }

  return [allOk, bundle.entry[0].resource as User];
}

/**
 * Logs in the user with email address and password.
 * Returns the user on success.
 *
 * @param email The user's email address.
 * @param password The user's plain text password.
 * @return the user details.
 */
export async function createLogin(client: ClientApplication, email: string, password: string): RepositoryResult<Login | undefined> {
  const [outcome, user] = await getUserByEmail(email);
  if (outcome.id !== 'allok') {
    return [outcome, undefined];
  }

  if (!user) {
    return [badRequest('User not found'), undefined];
  }

  const passwordHash = user?.passwordHash;
  if (!passwordHash) {
    return [badRequest('Invalid user'), undefined];
  }

  const bcryptResult = await bcrypt.compare(password, passwordHash);
  if (!bcryptResult) {
    return [badRequest('Incorrect password'), undefined];
  }

  return repo.createResource({
    resourceType: 'Login',
    client: {
      reference: client.resourceType + '/' + client.id,
    },
    user: {
      reference: user.resourceType + '/' + user.id
    }
  });
}

//   public OperationOutcome getLoginProfile(final Login login) {
//   final Reference reference = login.user();
//   if (reference == null || reference.reference() == null || !reference.reference().startsWith(User.RESOURCE_TYPE)) {
//     return StandardOutcomes.invalid("Missing login user");
//   }

//   final OperationOutcome outcome = repo.readReference(SecurityUser.SYSTEM_USER, reference);
//   if (!outcome.isOk()) {
//     return outcome;
//   }

//   final Reference profileReference = login.profile();
//   if (profileReference == null) {
//     return StandardOutcomes.invalid("Missing login profile");
//   }

//   final User user = outcome.resource(User.class);
//   if (!profileReference.reference().equals(user.patient().reference()) &&
//     !profileReference.reference().equals(user.practitioner().reference())) {
//     return StandardOutcomes.invalid("Invalid login profile");
//   }

//   return repo.readReference(SecurityUser.SYSTEM_USER, profileReference);
// }

//   public boolean validateClient(final String clientId) {
//   final OperationOutcome outcome = repo.read(SecurityUser.SYSTEM_USER, ClientApplication.RESOURCE_TYPE, clientId);
//   return outcome.isOk();
// }

//   public ClientApplication getClient(final String clientId) {
//   final OperationOutcome outcome = repo.read(SecurityUser.SYSTEM_USER, ClientApplication.RESOURCE_TYPE, clientId);
//   if (!outcome.isOk()) {
//     return null;
//   }
//   return outcome.resource(ClientApplication.class);
// }

//   public Login validateCode(final String code) {
//   final OperationOutcome outcome = repo.read(SecurityUser.SYSTEM_USER, Login.RESOURCE_TYPE, code);
//   if (!outcome.isOk()) {
//     return null;
//   }
//   return outcome.resource(Login.class);
// }

//   public OperationOutcome setScopes(final Login login, final String scope) {
//   final Login updated = Login.create(login).scope(scope).build();
//   return repo.update(SecurityUser.SYSTEM_USER, updated.id(), updated);
// }

//   public OperationOutcome setRole(final Login login, final Reference role) {
//   final Login updated = Login.create(login).profile(role).build();
//   return repo.update(SecurityUser.SYSTEM_USER, updated.id(), updated);
// }

//   public RefreshToken validateRefreshToken(final String refreshToken) {
//   final String keyId;
//   try {
//     keyId = decodeAndVerifyToken(refreshToken).getJwtId();
//   } catch (MalformedClaimException | InvalidJwtException ex) {
//     LOG.debug("Invalid refresh token: {}", ex.getMessage(), ex);
//     return null;
//   }

//   final OperationOutcome outcome = repo.read(SecurityUser.SYSTEM_USER, RefreshToken.RESOURCE_TYPE, keyId);
//   if (!outcome.isOk()) {
//     return null;
//   }
//   return outcome.resource(RefreshToken.class);
// }

//   public JwtResult generateAccessToken(
//   final ClientApplication client,
//   final FhirResource profile,
//   final String scope) {

//   return generateJwt(Map.of(
//     "sub", profile.id(),
//     "token_use", "access",
//     "scope", scope,
//     "client_id", client.id(),
//     "username", profile.id(),
//     "profile", profile.createReference().reference()
//   ), ONE_HOUR);
// }

//   public JwtResult generateRefreshToken(
//   final ClientApplication client,
//   final FhirResource profile,
//   final String scope) {

//   final JwtResult result = generateJwt(Map.of(
//     "sub", profile.id(),
//     "scope", scope
//   ), TWO_WEEKS);

//   final RefreshToken refreshToken = RefreshToken.create()
//     .user(profile.createReference())
//     .scope(scope)
//     .build();

//   // Use "update" rather than "create" to specify the ID
//   // Most users do not have the right to do this, but system user does
//   // Because we trust that JWT ID will be a unique UUID
//   repo.update(
//     SecurityUser.SYSTEM_USER,
//     result.getJwtId(),
//     refreshToken);

//   return result;
// }

//   public JwtResult generateIdToken(
//   final ClientApplication client,
//   final FhirResource profile) {

//   return generateJwt(Map.of(
//     "sub", profile.id(),
//     "aud", client.id(),
//     "fhirUser", profile.createReference().reference()
//   ), ONE_HOUR);
// }
