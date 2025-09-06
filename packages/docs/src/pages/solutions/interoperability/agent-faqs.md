# Medplum Agent FAQ's 

## What is the Medplum Agent? 

The Medplum Agent is an open-source, lightweight service that acts as a bridge between Medplum's cloud-based FHIR server and on-premise healthcare systems or devices. This enables integrations with legacy systems that cannot directly connect to cloud services. 

## Is the Medplum Agent secure? 

Yes, the Medplum Agent is designed with strong security measures appropriate for healthcare environments:

- **End-to-end encryption** for all data transmission between the agent and Medplum cloud. Specifically, we use **TLS/SSL protocols** for secure communication channels, converting from HTTPS to WSS connection. 
- **HIPAA and SOC2 compliance** across [all Medplum products](/docs/compliance) 

## Is the Medplum Agent secure even if it is open-source? 

Yes! All code, regardless if it is authored by a Medplum maintainer, customer, or open-source community member, is automatically scanned for security vulnerabilities and manually reviewed by Medplum maintainers before it is added to an official release. 

## I use Mirth right now. Is the Medplum Agent a good alternative? 

Yes, read our [blog post](/blog/medplum-for-mirth-users)! 

## Who uses the Medplum Agent? Will we be the first ones? 

No! The Medplum Agent was developed in partnership with our friends at **insert info about customer with their approval**, and used in **insert info**. See their case study for more information. 
