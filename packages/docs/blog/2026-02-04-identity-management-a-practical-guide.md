---
slug: identity-management
title: Identity Management - A Practical Guide
authors: everett
---

# Identity Management: A Practical Guide

Healthcare applications require careful decisions about user authentication and access control. Whether you're building an EHR, a clinical workflow tool, or a patient portal, getting identity management right from the start will save you from costly architectural mistakes down the road.

This guide breaks down the key decisions you'll face when integrating with a FHIR-based platform like Medplum, explains the tradeoffs, and recommends approaches that work well for most healthcare organizations.

<!-- truncate -->

## The Basics: Authentication vs. Authorization

Before diving into architectural decisions, let's clarify two terms that often get confused:

**Authentication (AuthN)** answers the question: "Who are you?" It's the process of verifying a user's identity — typically through a username/password combination, single sign-on, or biometric verification.

**Authorization (AuthZ)** answers the question: "What can you do?" Once we know who you are, authorization determines which resources you can access and what actions you can perform.

In healthcare, both are critical. You need to know that Dr. Smith is actually Dr. Smith (authentication), and you need to ensure Dr. Smith can only access records for patients in her practice (authorization).

## Decision 1: Using Email Address Logins vs. External Identity Provider (IDP)

The first fundamental decision is how to uniquely identify users in your system. You have two primary options:

### Option A: Email Address

Using email as the unique identifier is simple and intuitive. Users log in with their email, and the system matches them to their account.

**Advantages:**
- Familiar to users
- Works with multiple login methods (Google, Microsoft, Okta)
- No additional services needed

**Disadvantages:**
- Email addresses change (marriage, company rebranding, job changes)
- When an email changes, you need manual processes to update the account linkage
- Can create orphaned accounts if not managed carefully

### Option B: External ID (e.g., Okta User ID)

Instead of email, you can use a stable identifier from your identity provider — like an [Okta User ID](https://developer.okta.com/docs/api/openapi/okta-management/management/tag/User/) or [Azure AD Object ID](https://learn.microsoft.com/en-us/graph/api/resources/user?view=graph-rest-1.0).

**Advantages:**
- The ID never changes, regardless of email updates
- More robust for long-term identity management
- More flexible for multi-provider scenarios

**Disadvantages:**
- Users are locked to a single identity provider
- Requires more upfront configuration by admins

### Recommendation

The right choice depends on your organization's size and existing infrastructure.

**For smaller organizations** without an existing identity provider, email-based identification is perfectly sufficient. It's simpler to set up, requires no additional infrastructure, and the occasional email change can be handled manually without significant overhead. Medplum supports [multi-factor authentication (MFA)](https://www.medplum.com/docs/auth/mfa), which is required for many regulated scenarios.

**For enterprise customers** with existing IDP infrastructure (Okta, Azure AD, etc.), a hybrid approach works best:

- **Use external IDs for your organization's internal staff** (the team building and operating the platform). These users have employer-managed identities through your corporate IDP, and stability matters more than flexibility. When an employee's email changes from `jsmith@yourcompany.com` to `jane.smith@yourcompany.com`, their account should continue working seamlessly with your existing SSO.

- **Use email for patients and domain-level routing to IDPs for partners** (clinicians or administrators at clinics using your EMR, etc.). This provides flexibility because different customer organizations may use different identity providers - or none at all. Email-based identification allows Medplum to dynamically route users to the appropriate IDP based on their email domain. For example, `user@clinic-a.com` routes to Clinic A's Okta instance, while `user@clinic-b.com` routes to Clinic B's Azure AD.

This hybrid approach lets you maintain tight SSO integration for your own team while giving customers the flexibility to use whatever identity infrastructure they have.

## Decision 2: Identity Provider Strategy

The next decision is where user credentials are managed. You have three options:

### Option A: Medplum as IDP

Medplum manages credentials directly. Users create accounts with Medplum, which handles password storage, reset flows, and authentication.

**Best for:** Smaller deployments, patient-facing applications where you don't have existing identity infrastructure.

### Option B: External IDP

A third-party service (Okta, Azure AD, Auth0) manages credentials. Your platform trusts the [external IDP](https://www.medplum.com/docs/auth/external-identity-providers) to authenticate users.

**Best for:** Enterprise deployments with existing identity infrastructure. Enables centralized user management - when an employee leaves, disabling their Okta account immediately revokes access to all connected systems.

### Option C: Domain-Level Routing

This advanced approach routes users to different identity providers based on their email domain. When `user@hospital-a.com` logs in, they're sent to Hospital A's Okta instance. When `user@hospital-b.com` logs in, they're sent to Hospital B's Azure AD.

**Best for:** Multi-tenant platforms serving multiple healthcare organizations, each with their own identity infrastructure. Medplum supports [domain-level identity providers](https://www.medplum.com/docs/auth/domain-level-identity-providers) for this use case.

## Decision 3: Token Flow Architecture

This is where many teams make costly mistakes. Understanding token flows is essential for building a secure, maintainable system.

### What's a Token?

A token is a data packet that proves a user's identity for API requests. Think of it like a wristband at a concert - it proves you're allowed to be there without requiring you to show your ID at every interaction.

When integrating with external identity providers, you'll encounter multiple tokens:
- **IDP Token** (from Okta, Azure AD, etc.): Proves the user authenticated with the external IDP
- **Platform Token** (from Medplum): Required to access the FHIR API

The question is: how do you get from an IDP token to a platform token?

### Before Building Custom Infrastructure

When evaluating token flows, it's worth asking whether custom middleware or proxy layers are truly necessary. Modern FHIR platforms typically provide robust, standards-compliant authentication out of the box.

Before adding intermediate infrastructure, consider:

- **What specific requirement does it solve?** Make sure there's a documented need that the platform's native authentication can't address.
- **What's the maintenance burden?** Custom auth layers require ongoing security updates and auditing.
- **Does it duplicate existing functionality?** Often, the platform already handles what you're trying to build.

In most cases, the three-legged OAuth (redirect flow) described below will meet your needs without additional complexity.

### Three-Legged OAuth (Recommended)

[Three legged OAuth](https://www.medplum.com/docs/auth/external-identity-providers) is the recommended approach unless your application needs access to other services beyond Medplum:

1. User clicks "Login" in your app
2. Browser redirects to Okta
3. User authenticates with Okta
4. Okta redirects back to your app with a code
5. Your app exchanges the code with Medplum
6. Medplum validates with Okta and issues its own token
7. User's browser stores only the Medplum token

**Result:** User ends up with just a Medplum token. Clean, simple, secure.

**Best for:** Applications that only need to access Medplum APIs.

### Token Exchange (Multi-Service Access)

[Token exchange](https://www.medplum.com/docs/auth/token-exchange) is useful for multi-service workflows:

1. User authenticates with Okta
2. Okta issues a token stored in the user's browser
3. Your app sends the Okta token to Medplum's token exchange endpoint
4. Medplum validates the token and issues its own token
5. User's browser stores both tokens

**Result:** User has both an Okta token and a Medplum token.

**Why this matters:** If your application needs to access other services beyond Medplum (billing systems, other healthcare APIs, etc.), the user still has their Okta token to authenticate with those services. This is common in healthcare, where a single workflow might touch multiple systems.

```javascript
// Using the Medplum SDK for token exchange
const medplum = new MedplumClient({
  baseUrl: MEDPLUM_BASE_URL,
  clientId: MEDPLUM_CLIENT_ID,
});

// Exchange your external IDP token for a Medplum token
await medplum.exchangeExternalAccessToken(OKTA_ACCESS_TOKEN);

// Now you can make FHIR API calls
const patient = await medplum.readResource('Patient', patientId);
```

### On-Behalf-Of (Server-Side Pattern)

For server-side applications that act as intermediaries, the [On-Behalf-Of](https://www.medplum.com/docs/auth/on-behalf-of) pattern allows a trusted backend to make requests on behalf of specific users:

1. Your backend authenticates as a ClientApplication
2. When making requests, include a header specifying which user you're acting for
3. Medplum applies that user's access policies to the request

```bash
curl 'https://api.medplum.com/fhir/R4/Patient' \
  --user $CLIENT_ID:$CLIENT_SECRET \
  -H 'content-type: application/fhir+json' \
  -H 'x-medplum: extended' \
  -H 'x-medplum-on-behalf-of: ProjectMembership/abc123' \
  --data-raw '{"resourceType":"Patient","name":[{"given":["Homer"],"family":"Simpson"}]}'
```

**Best for:** Architectures where a custom backend mediates all interactions with Medplum. Useful for maintaining audit trails showing both which system made the request and which user it was acting for.

## Putting It Together: Recommended Architecture

For most healthcare organizations building on a FHIR platform, here's the recommended approach:

1. **Choose your unique identifiers** - external IDs for your internal staff, email for customers and their users
2. **Use an external IDP** (Okta, Azure AD) for enterprise users, with domain-level routing for multi-tenant scenarios
3. **Implement Token Exchange** for your client applications
4. **Lean on native platform capabilities** unless you have a specific, documented requirement for custom infrastructure

This architecture gives you:
- Centralized user management through your existing IDP
- Stable user accounts that survive email changes
- Flexibility to access multiple services with the same authentication
- Direct API access without unnecessary intermediaries

## Key Questions to Ask

Before finalizing your identity architecture, ensure you can answer these questions:

1. **Who are your user types?** (Staff, clinicians, patients, caregivers)
2. **What identity providers do they use?** (Corporate SSO, social login, self-registration)
3. **What other systems need the IDP token?** (Determines if you need Token Exchange)
4. **How do you handle user offboarding?** (Centralized IDP makes this easier)
5. **What's your multi-tenancy model?** (May require domain-level routing)

## Conclusion

Identity management doesn't have to be complicated. The key is understanding your requirements before jumping into implementation.

Start with the simplest approach that meets your needs. Token Exchange with an external IDP covers the vast majority of healthcare use cases while maintaining flexibility for future requirements.

---

*For a complete overview of authentication options, see the [Medplum Authentication Documentation](https://www.medplum.com/docs/auth).*
