---
slug: security-reports
title: Our Guide to Security Reports
authors: cody
tags: [security, compliance, auth, community]
---

As a founder, you wear a lot of hats. One of mine is handling the security reports that land in our inbox.

Thanks to a strong security posture, including regular third-party pen tests, genuine vulnerability reports are rare. However, like any online business, we see a steady stream of security _inquiries_. These tend to fall into two distinct camps: the valuable, good-faith reports from legitimate researchers... and the noise.

<!-- truncate -->

The "noise" is what security expert Troy Hunt perfectly named **["Beg Bounties."](https://www.troyhunt.com/beg-bounties/)** These are the low-effort, templated emails fishing for a payout for a non-issue.

We decided early on to be direct, transparent, and respectful of everyone's time—ours and the researcher's. So, when someone emails us about a potential vulnerability, here's the kind of response they can expect from us:

> **Subject: Re: Inquiry Regarding Security Issue**
>
> Thanks for your interest in the security of the Medplum platform. We take all potential vulnerabilities seriously.
>
> Our process is to first receive the full details of the potential issue, including steps to reproduce it. Once received, our team will validate the report.
>
> To set clear expectations, we absolutely offer fair compensation for novel, verifiable vulnerabilities with a demonstrable security impact.
>
> We do not, however, provide compensation for common out-of-scope reports, including:
>
> - Suboptimal HTTP security header configurations
> - Missing best practices on DNS records (SPF/DKIM/DMARC)
> - Scanner output without a proven, practical exploit
>
> This approach allows us to focus on genuine, impactful security research. We look forward to receiving the details of your finding.
>
> Best regards,
>
> The Medplum Team

That's it. It's a simple, firm, and fair template. Here's why it works for us:

1.  **It puts process first.** The conversation about money is on hold until we see a real vulnerability.
2.  **It filters out the noise.** It clearly states what we don't pay for, saving everyone a lot of back-and-forth.
3.  **It encourages real research.** It confirms we _do_ pay for legitimate findings with a real-world impact.

This email is our day-to-day tactic, but it's based on our official strategy, which is documented for anyone to see in our **[Responsible Disclosure Policy on GitHub](https://github.com/medplum/medplum/blob/main/SECURITY.md)**. It goes into more detail and includes a Safe Harbor clause to assure good-faith researchers they're protected.

The bottom line is simple: We take security seriously, and we take real security researchers seriously. If you have a legitimate, high-impact vulnerability, we genuinely want to hear from you and will be happy to compensate you for your work.
