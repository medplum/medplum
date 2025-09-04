---
sidebar_position: 1
tags: [auth]
---

# Authentication Methods

Choose the right authentication approach for your Medplum integration in under 60 seconds.

## Quick Decision Guide

### 🔍 What are you building?

**User-facing application** (web app, mobile app, patient portal)  
→ **Client-Side Authentication**  
Supports multiple identity providers

**Backend service or API** (server proxy, legacy system integration)  
→ **Server-Side Authentication**  
Trusted environment operations

**Device or automation** (lab equipment, CI/CD pipeline, data sync)  
→ **Device/Host Authentication**  
Machine-to-machine connectivity

---

## Client-Side Authentication

**Perfect for:** Patient portals, provider apps, mobile applications

### Choose Your Identity Provider

<table>
<tr>
<th>Scenario</th>
<th>Recommended Method</th>
</tr>
<tr>
<td><strong>Simple, fast setup</strong><br/>New application, basic login needs</td>
<td><a href="/docs/auth/methods/oauth-auth-code">OAuth Authorization Code</a><br/>Use Medplum as identity provider</td>
</tr>
<tr>
<td><strong>Enterprise SSO required</strong><br/>Auth0, Okta, Azure AD integration</td>
<td><a href="/docs/auth/methods/external-identity-providers">External Identity Providers</a><br/>Federated authentication</td>
</tr>
<tr>
<td><strong>Google-first experience</strong><br/>Consumer app, Google Workspace users</td>
<td><a href="/docs/auth/methods/google-auth">Google Authentication</a><br/>Built-in Google integration</td>
</tr>
<tr>
<td><strong>Advanced enterprise</strong><br/>Domain-wide SSO enforcement</td>
<td><a href="/docs/auth/methods/domain-level-identity-providers">Domain-Level Identity Providers</a><br/>Automatic provider routing</td>
</tr>
</table>

### 🚀 Quick Start Example

```typescript
// Using Medplum OAuth (simplest option)
import { MedplumClient } from '@medplum/core';

const medplum = new MedplumClient({
  baseUrl: 'https://api.medplum.com/',
  clientId: 'YOUR_CLIENT_ID'
});

// Start login flow
await medplum.startLogin('user@example.com');
```

---

## Server-Side Authentication

**Perfect for:** Backend APIs, legacy system integration, server proxies

### When to Use Server-Side Auth
- ✅ Adding Medplum to existing applications
- ✅ Building API gateways or proxies
- ✅ Need server-side token management
- ✅ Operating in trusted environments

### Implementation Options

| Method | Use Case | Security Level |
|--------|----------|----------------|
| **[Client Credentials](/docs/auth/methods/client-credentials)** | Standard server auth | 🔒 OAuth2 (Recommended) |
| **[Basic Authentication](/docs/auth/methods/basic-auth)** | Stateless environments | 🔒 HTTP Basic |

### 🚀 Quick Start Example

```typescript
// Client Credentials (recommended)
const medplum = new MedplumClient({
  baseUrl: 'https://api.medplum.com/',
  clientId: 'YOUR_CLIENT_ID',
  clientSecret: 'YOUR_CLIENT_SECRET'
});

await medplum.startClientLogin();
```

---

## Device/Host Authentication

**Perfect for:** Lab analyzers, IoT devices, automated systems, CI/CD pipelines

### When to Use Device Auth
- ✅ True machine-to-machine connectivity
- ✅ Non-interactive authentication
- ✅ Minimal access scope requirements
- ✅ No user interface available

### Security-First Approach
Device authentication uses the same **[Client Credentials](/docs/auth/methods/client-credentials)** method as server-side auth, but with:
- 🔒 **Extremely restricted access policies** (principle of least privilege)
- 🌐 **Network isolation** (VPC/firewall restrictions recommended)
- 🔑 **Secrets management** (never store credentials on disk)

---

## Special Topics

### 🔄 Migration & Token Management
- **[Token Exchange](/docs/auth/methods/token-exchange)** - Convert external tokens to Medplum tokens
- **[External IDs](/docs/auth/methods/external-ids)** - Map non-email identities
- **[User Management](/docs/auth/user-management-guide)** - Create and manage user accounts

### 🛡️ Security & Compliance
- **[IP Address Restrictions](/docs/access/ip-access-rules)** - Network-based access control
- **[Access Policies](/docs/access/access-policies)** - Fine-grained permissions

---

## Need Help Choosing?

### Common Questions

**"I'm migrating from Firebase Auth"**  
→ Use [External Identity Providers](/docs/auth/methods/external-identity-providers) to integrate your existing Firebase setup

**"I need both web and mobile apps"**  
→ [OAuth Authorization Code](/docs/auth/methods/oauth-auth-code) works for both with the same client configuration

**"My organization requires Okta SSO"**  
→ [External Identity Providers](/docs/auth/methods/external-identity-providers) + [Domain-Level Identity Providers](/docs/auth/methods/domain-level-identity-providers) for automatic routing

**"I'm building a lab integration"**  
→ [Client Credentials](/docs/auth/methods/client-credentials) with device-specific access policies

### Still Unsure?

1. **Start simple:** Most applications should begin with [OAuth Authorization Code](/docs/auth/methods/oauth-auth-code)
2. **Add complexity later:** You can always add external identity providers or additional authentication methods
3. **Get help:** Join our [Discord community](https://discord.gg/medplum) or [schedule a consultation](https://www.medplum.com/contact)
