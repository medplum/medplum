---
id: security
slug: /security
---

# Security

## Security as a Company Value

Medplum’s security & compliance principles guide how we deliver our products and services, enabling people to simply and securely access the digital world.

## Secure Personnel

Medplum takes the security of its data and that of its clients and customers seriously and ensures that only vetted personnel are given access to their resources.

- All Medplum contractors and employees undergo background checks prior to being engaged or employed by us in accordance with local laws and industry best practices.
- Confidentiality or other types of Non-Disclosure Agreements (NDAs) are signed by all employees, contractors, and others who have a need to access sensitive or internal information.
- We embed the culture of security into our business by conducting employee security training & testing using current and emerging techniques and attack vectors.

## Secure Development

- All development projects at Medplum, including on-premises software products, support services, and our own Digital Identity Cloud offerings follow secure development lifecycle principles.
- All development of new products, tools, and services, and major changes to existing ones, undergo a design review to ensure security requirements are incorporated into proposed development.
- All team members that are regularly involved in any system development undergo annual secure development training in coding or scripting languages that they work with as well as any other relevant training.
- Software development is conducted in line with OWASP Top 10 recommendations for web application security.

## Secure Testing

Medplum deploys third party penetration testing and vulnerability scanning of all production and Internet facing systems on a regular basis.

- All new systems and services are scanned prior to being deployed to production.
- We perform penetration testing both by internal security engineers and external penetration testing companies on new systems and products or major changes to existing systems, services, and products to ensure a comprehensive and real-world view of our products & environment from multiple perspectives.
- We perform static and dynamic software application security testing of all code, including open source libraries, as part of our software development process.

## Cloud Security

Hosted Medplum provides maximum security with complete customer isolation in a modern, multi-tenant cloud architecture.

Hosted Medplum leverages the native physical and network security features of the cloud service, and relies on the providers to maintain the infrastructure, services, and physical access policies and procedures.

- All customer cloud environments and data are isolated using Medplum’s account based isolation approach. Each customer environment is stored within a dedicated trust zone to prevent any accidental or malicious co-mingling.
- All data is also encrypted at rest and in transmission to prevent any unauthorized access and prevent data breaches. Our entire platform is also continuously monitored by dedicated, highly trained Medplum staff.
- We separate each customer's data and our own, utilizing accounts to ensure data is protected and isolated.
- Client’s data protection complies with SOC 2 standards to encrypt data in transit and at rest, ensuring customer and company data and sensitive information is protected at all times.
- We implement role-based access controls and the principles of least privileged access, and review revoke access as needed.

## Application Security

- Encryption - Data is encrypted in transit with TLS 1.2. Data is encrypted at rest with AES.
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

## Compliance

Medplum is committed to providing secure products and services to safely and easily manage billions of digital identities across the globe. Our external certifications provide independent assurance of Medplum’s dedication to protecting our customers by regularly assessing and validating the protections and effective security practices Medplum has in place.

## SOC 2 Type 1 & 2

Orangebot, Inc (dba Medplum) successfully completed the AICPA Service Organization Control (SOC) 2 Type II audit. The audit confirms that Orangebot, Inc (dba Medplum)’s information security practices, policies, procedures, and operations meet the SOC 2 standards for security.

Medplum was audited by Prescient Assurance, a leader in security and compliance certifications for B2B, SAAS companies worldwide. Prescient Assurance is a registered public accounting in the US and Canada and provide risk management and assurance services which includes but not limited to SOC 2, PCI, ISO, NIST, GDPR, CCPA, HIPAA, CSA STAR etc. For more information about Prescient Assurance, you may reach out them at info@prescientassurance.com.

An unqualified opinion on a SOC 2 Type II audit report demonstrates to the Medplum’s current and future customers that they manage their data with the highest standard of security and compliance.

<img src="/img/compliance/soc.png" alt="AICPA SOC Logo" style={{ width: 150 }} />

Customers can request access to the audit report.

## Security Tools

Medplum continuously monitors all services to track security best practices.

### SonarCloud

[SonarCloud](https://observatory.mozilla.org/) is a cloud-based code quality and security service.

<a href="https://sonarcloud.io/summary/new_code?id=medplum_medplum"><img src="/img/compliance/sonarcloud.png" alt="SonarCloud screenshot" width="500" /></a>

### Mozilla Observatory

[Mozilla Observatory](https://observatory.mozilla.org/) is a tool that is geared towards informing website owners of best practices for securing their sites.

<a href="https://www.ssllabs.com/ssltest/analyze.html?d=api.medplum.com"><img src="/img/compliance/mozilla-observatory-api.png" alt="Mozilla Observatory api.medplum.com screenshot" width="350" /></a>
<a href="https://www.ssllabs.com/ssltest/analyze.html?d=app.medplum.com"><img src="/img/compliance/mozilla-observatory-app.png" alt="Mozilla Observatory app.medplum.com screenshot" width="350" /></a>

### SSL Labs

[SSL Labs](https://www.ssllabs.com/index.html) is an online service that performs a deep analysis of the configuration of any SSL web server on the public Internet.

<a href="https://www.ssllabs.com/ssltest/analyze.html?d=api.medplum.com"><img src="/img/compliance/ssllabs-api.png" alt="SSL Labs api.medplum.com screenshot" width="350" /></a>
<a href="https://www.ssllabs.com/ssltest/analyze.html?d=app.medplum.com"><img src="/img/compliance/ssllabs-app.png" alt="SSL Labs app.medplum.com screenshot" width="350" /></a>

### Security Scorecard

[Security Scorecard](https://securityscorecard.com/) is an information security company that rates cybersecurity postures of corporate entities through completing scored analysis of cyber threat intelligence signals for the purposes of third party management and IT risk management.

<a href="https://securityscorecard.com/security-rating/medplum.com?utm_medium=badge&utm_source=medplum.com&utm_campaign=seal-of-trust&utm_content=https://platform.securityscorecard.io/"><img src="/img/compliance/securityscorecard.png" alt="Security Scorecard Logo" width="200" /></a>

## Availability

Medplum tracks and reports status on the [Medplum Status Page](https://status.medplum.com/) using [StatusCake](https://www.statuscake.com/) and [Pingdom](https://www.pingdom.com/).

## Report Vulnerabilities

Found a potential issue? Please help us by reporting it so we can fix it quickly.

Contact us at security@medplum.com
