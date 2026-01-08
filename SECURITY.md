# Medplum Security

## Our Commitment to Security

Our #1 priority is your trust.

Medplum uses enterprise-grade security and regular audits to ensure you're always protected. We undergo regular penetration testing and security reviews designed to be SOC 2 compliant.

This commitment to security is ingrained in our culture.

## Application Security

- Encryption - Data is encrypted in transit with TLS 1.2 and 1.3. Data is encrypted at rest with AES.
- Continuous Monitoring - Independent third-party penetration, threat, and vulnerability testing.
- Data Handling - Medplum is in full compliance with GDPR and has support for data deletion.
- SSO - User access controls with single sign on.
- Secure Hosting - Medplum's cloud environments are backed by AWS' security measures.
- RBAC - Role based account access workflows.

## Continuous Security Commitment

- Penetration Testing - We perform an independent third-party penetration test at least annually to ensure that the security posture of our services is uncompromised.
- Security Awareness Training - Our team members are required to go through employee security awareness training covering industry standard practices and information security topics such as phishing and password management.
- Third-Party Audits - Our organization undergoes independent third-party assessments to test our security controls.
- Roles and Responsibilities - Roles and responsibilities related to our information security program and the protection of our customer's data are well defined and documented.
- Information Security Program - We have an information security program in place that is communicated throughout the organization. Our information security program follows the criteria set forth by SOC 2.
- Continuous Monitoring - We continuously monitor our security and compliance status to ensure there are no lapses.

## Responsible Disclosure Policy

Medplum welcomes the contributions of security researchers to help us keep our platform safe. If you believe you have found a security vulnerability, we encourage you to report it to us through the process outlined below.

### Reporting a Vulnerability

Please share the details of any suspected vulnerability with the Medplum Security Team by emailing **<security@medplum.com>**.

To help us validate and triage your finding, please include as much detail as possible, such as:

- A description of the vulnerability and its potential impact.
- The system or domain where the vulnerability was discovered.
- Detailed steps to reproduce the issue, including any proof-of-concept code or screenshots.

### Scope

Our responsible disclosure policy covers the following systems:

- `*.medplum.com`
- The Medplum open source codebase hosted on GitHub.

The following finding types are **explicitly out of scope** and are not eligible for compensation:

- Findings from automated scanners or tools without a demonstrated, practical exploit.
- Outdated software or library versions without a working proof-of-concept.
- Reports on the configuration of HTTP headers (e.g., missing security headers) or DNS records (e.g., SPF/DKIM/DMARC) unless a specific, severe impact is demonstrated.
- Reports of insecure SSL/TLS ciphers or protocol versions.
- Denial of Service (DoS) or Distributed Denial of Service (DDoS) vulnerabilities.
- Social engineering, phishing, or physical attacks against Medplum employees, users, or infrastructure.
- Self-XSS and other vulnerabilities requiring an unlikely degree of user interaction.

### Compensation

Medplum does not operate a formal, public bug bounty program.

However, we believe in recognizing and rewarding valuable security research. For novel, verifiable vulnerabilities with a clear and demonstrable security impact, **we offer discretionary compensation at our sole discretion.** The amount will be based on the severity, impact, and quality of your report.

Our philosophy on this is aligned with the principles outlined in Troy Hunt's post on "Beg Bounties," which you can read here: [https://www.troyhunt.com/beg-bounties/](https://www.troyhunt.com/beg-bounties/). We do not provide payment for out-of-scope reports or to be "added to a list of researchers."

### Safe Harbor

We consider security research conducted under this policy to be authorized and will not pursue or support legal action against you for good faith, accidental violations of this policy. We waive any claims against you for circumventing the technological measures we have in place to protect our applications. This safe harbor requires that you comply with all applicable laws and do not compromise the privacy or safety of our customers or the availability of our services.
