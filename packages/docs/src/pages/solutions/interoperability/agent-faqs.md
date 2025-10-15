# Medplum Agent FAQ's 

## What is the Medplum Agent? 

The Medplum Agent is an open-source, lightweight service that acts as a bridge between Medplum's cloud-based FHIR server and on-premise healthcare systems or devices. This enables integrations with legacy systems that cannot directly connect to cloud services. 

## Why use the Medplum Agent? 

HL7, DICOM, and other legacy feeds often sit within closed-system networks, and we built the Medplum Agent specifically to alleviate the need to maintain site-to-site VPN tunnels. For more information on our infrastructure, see [our docs](/docs/agent). 

## Is the Medplum Agent secure? 

Yes, the Medplum Agent is designed with strong security measures appropriate for healthcare environments:

- **End-to-end encryption** for all data transmission between the agent and Medplum cloud. Specifically, we use **TLS/SSL protocols** for secure communication channels, converting from HTTPS to WSS connection. 
- **HIPAA and SOC2 compliance** across [all Medplum products](/docs/compliance) 

## Is the Medplum Agent secure even if it is open-source? 

Yes! All code contributed to Medplum, regardless if it is authored by a Medplum Maintainer (a.k.a. employee), customer, or open-source community member, is automatically scanned for security vulnerabilities and manually reviewed by [Medplum Maintainers](https://www.medplum.com/about) before it is added to an official release. 

## What kind of server do I need to run the Medplum Agent service? 

The Medplum Agent can run on any operating system version that is currently supported by its vendor and has not reached end-of-life (EOL). This includes supported versions of [Windows](https://learn.microsoft.com/en-us/lifecycle/). We recommend using actively maintained versions to ensure you receive security updates and vendor support.

## Are auto-updates supported? As a member of our security team, what kinds of controls are available? 

The Medplum Agent supports [remote monitoring and upgrade features](/docs/agent/features) that allow for auto-updates. We recognize that healthcare organizations have varying requirements for update management based on their security policies and operational workflows, and we aim to provide operational flexibility for our users. 

#### Control Structure  

Medplum operates with the following roles and responsibilities: 

- Medplum Team: develops and releases the Medplum server platform and Medplum Agent
- Service Provider: consumes the Medplum server platform and Medplum Agent feeds, and has administrative control over [remote operations](/docs/agent/features) relating to monitoring and upgrading 
- IT/Security Team: responsible for Medplum Agent installation in the local network, as well as security and update policies in the local network 

The Service Provider maintains administrative control over remote monitoring and upgrade operations. For specific details on auto-update configuration, approval workflows, and security controls in your environment, please coordinate with your Service Provider. 

## How often are Medplum Agent version updates released? 

The Medplum Agent follows our general [Medplum versioning policy](/docs/compliance/versions). Notably, the Medplum Agent does not require any kind of server maintenance or database migration; minor versions can be deployed directly without intermediate steps. 

## I use Mirth right now. Is the Medplum Agent a good alternative? 

Yes, read our [blog post](/blog/medplum-for-mirth-users)! 

