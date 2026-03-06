---
sidebar_position: 3
---

# Subdomain Delegation to Route 53

If your domain is managed by another provider (Squarespace, GoDaddy, Namecheap, Cloudflare, Vercel, etc.), you can delegate a subdomain to [Amazon Route 53](https://aws.amazon.com/route53/) without transferring the entire domain. Your existing website, email, and other services remain unaffected.

Medplum's CDK requires Route 53 for DNS because it automatically provisions SSL certificates and creates DNS records during deployment. This guide walks through how to set that up without disrupting anything on your current domain.

For transferring your entire domain to Route 53 instead, see [Domain Registration with Route 53](/docs/self-hosting/domain-registration).

## What This Does

After completing the steps below, Route 53 will manage DNS for your Medplum base domain (e.g., `medplum.yourdomain.com`) and everything under it. Medplum's CDK automatically creates the following records:

- `api.medplum.yourdomain.com` — API server
- `app.medplum.yourdomain.com` — Web application
- `storage.medplum.yourdomain.com` — Binary storage

Your root domain (`yourdomain.com`) and all other subdomains continue to resolve through your existing DNS provider. Nothing changes for them.

## Step 1: Create a Hosted Zone in Route 53

1. Open the [Route 53 console](https://console.aws.amazon.com/route53/).
2. Navigate to **Hosted zones** → **Create hosted zone**.
3. For **Domain name**, enter the base domain you want Medplum to use (e.g., `medplum.yourdomain.com`).
4. For **Type**, select **Public hosted zone**.
5. Click **Create hosted zone**.

After creation, Route 53 displays several records. You need the four **NS (Name Server)** records. They look like this:

```
ns-1301.awsdns-34.org
ns-1860.awsdns-40.co.uk
ns-34.awsdns-04.com
ns-570.awsdns-07.net
```

Copy all four values.

:::tip
Route 53 also displays an **SOA (Start of Authority)** record. You do not need it. Only copy the four NS records.
:::

## Step 2: Add NS Records at Your DNS Provider

At your DNS provider, add four NS records that point your Medplum subdomain to the Route 53 nameservers from Step 1.

:::info Where to add these records
Add these records **wherever your DNS is currently managed**. If you're unsure, run `dig yourdomain.com NS +short` to see which nameservers your domain points to today. That tells you where to make changes.

For example, if your domain was purchased through Squarespace but `dig` shows Vercel nameservers, add the NS records in the Vercel dashboard.
:::

The **host/name** field is your subdomain prefix (e.g., `medplum`). The **value** is one nameserver per record. If your provider asks for a TTL, **3600** (1 hour) is a safe default.

:::caution Use the relative name, not the full domain
Set the host/name field to `medplum`, **not** `medplum.yourdomain.com`. Using the full domain name (FQDN) is the most common misconfiguration and will cause DNS resolution to fail silently. Most registrar UIs automatically append your domain.
:::

### Cloudflare

Navigate to your domain → **DNS** → **Records** → **Add record**.

| Type | Name      | Target                    |
| ---- | --------- | ------------------------- |
| NS   | `medplum` | `ns-1301.awsdns-34.org`   |
| NS   | `medplum` | `ns-1860.awsdns-40.co.uk` |
| NS   | `medplum` | `ns-34.awsdns-04.com`     |
| NS   | `medplum` | `ns-570.awsdns-07.net`    |

_(Use your actual NS values from Step 1, not these examples.)_

:::caution Cloudflare proxy must be disabled
Cloudflare automatically enables its proxy (orange cloud) on new records. **NS records must use "DNS only" mode (grey cloud).** If you see a proxy toggle, make sure it is off. Proxied NS records will break subdomain delegation entirely.
:::

### Squarespace / Google Domains

Navigate to **Domains** → select your domain → **DNS** → **DNS Settings**. Add one record per nameserver:

| Type | Host      | Points to                 |
| ---- | --------- | ------------------------- |
| NS   | `medplum` | `ns-1301.awsdns-34.org`   |
| NS   | `medplum` | `ns-1860.awsdns-40.co.uk` |
| NS   | `medplum` | `ns-34.awsdns-04.com`     |
| NS   | `medplum` | `ns-570.awsdns-07.net`    |

_(Use your actual NS values from Step 1, not these examples.)_

### GoDaddy

Navigate to **My Products** → **DNS** for your domain. Click **Add** under DNS Records. Set type to `NS`, name to `medplum`, and add one record per nameserver.

### Namecheap

Navigate to **Domain List** → **Manage** → **Advanced DNS**. Click **Add New Record**. Set type to `NS Record`, host to `medplum`, and add one record per nameserver.

### Vercel

Navigate to your project's **Settings** → **Domains**. Select the domain, then go to the **DNS Records** tab. Click **Add** and set type to `NS`, name to `medplum`, and add one record per nameserver.

:::caution Trailing Dots
Route 53 displays nameservers with a trailing dot (e.g., `ns-1301.awsdns-34.org.`). Most registrar UIs do not accept the trailing dot. Remove it before saving. The registrar adds it internally.
:::

## Step 3: Verify DNS Propagation

DNS changes typically propagate within 15 minutes, but can take up to 48 hours depending on your registrar and existing TTL values. Verify by running:

```bash
dig medplum.yourdomain.com NS +short
```

The output should list your four Route 53 nameservers:

```
ns-1301.awsdns-34.org.
ns-1860.awsdns-40.co.uk.
ns-34.awsdns-04.com.
ns-570.awsdns-07.net.
```

You can also check propagation globally using [DNS Checker](https://dnschecker.org/).

### Troubleshooting

If the output is empty or shows unexpected nameservers after 15 minutes:

- **NXDOMAIN or empty response:** The most common cause is setting the host/name field to the full domain (`medplum.yourdomain.com`) instead of just the prefix (`medplum`). Check your registrar and correct the records.
- **Old nameservers returned:** Your registrar may be caching the previous response. Wait longer, or try querying a public resolver directly: `dig medplum.yourdomain.com NS +short @8.8.8.8`
- **Cloudflare users:** Verify the NS records are set to "DNS only" (grey cloud), not "Proxied."

## Step 4: Wait for SSL Certificates to Validate

**Do not run `cdk deploy` until your SSL certificates reach "Issued" status.** Medplum's CDK provisions certificates through [AWS Certificate Manager](https://console.aws.amazon.com/acm/) (ACM), which validates domain ownership via DNS. If DNS is not yet resolving to Route 53, certificate validation will hang indefinitely and `cdk deploy` will fail with a CloudFormation rollback.

Check certificate status in the ACM console. All certificates for your Medplum subdomains (`api.`, `app.`, `storage.`) must show **Issued** before proceeding.

:::tip
If certificates are stuck in "Pending validation" for more than 30 minutes and DNS propagation is confirmed, check that the CNAME validation records created by ACM are present in your Route 53 hosted zone. Medplum's CDK creates these automatically, but if you ran `cdk deploy` before DNS was ready, you may need to clean up and redeploy.
:::

## Step 5: Continue with Install on AWS

Once DNS propagation is confirmed and SSL certificates are issued, continue with the [Install on AWS](/docs/self-hosting/install-on-aws) guide. When `medplum aws init` prompts for the **base domain name**, enter the domain you configured above (e.g., `medplum.yourdomain.com`).

:::tip
`medplum aws init` generates a config file only. It does not deploy any infrastructure. If you visit your domain in a browser before running `cdk deploy`, you will see an `AccessDenied` XML response. This is expected — DNS is working correctly, but nothing has been deployed yet.
:::
