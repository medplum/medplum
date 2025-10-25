# Interoperability

## HL7 Connectivity 

### On-Prem Medplum Agent

We offer a developer-first alternative to Mirth, Corepoint, site-to-site VPN tunnels, and other HL7 connection solutions called the Medplum Agent. For FAQ's regarding the Medplum Agent, see [this page](/solutions/interoperability/agent-faqs). For information on how to install and use the Medplum agent, see our [documentation](/docs/agent). 

### SFTP Server Integrations 

Medplum supports SFTP server integrations for HL7 messages. See our example [receiving ORU bot](https://github.com/medplum/medplum/blob/main/examples/medplum-demo-bots/src/lab-integration/receive-oru-message.ts) and [sending ORM bot](https://github.com/medplum/medplum/blob/main/examples/medplum-demo-bots/src/lab-integration/send-orm-message.ts). 

## C-CDA 

Medplum's C-CDA (Consolidated Clinical Document Architecture) provides support for C-CDA to FHIR, FHIR to C-CDA, C-CDA to XML, and XML to C-CDA. For more information, see [our documentation](/docs/integration/c-cda). 

## FHIRcast

Medplum is fully certified as FHIRcast Hub, allow coordination of complex radiology workflows where multiple applications must synchronize in real-time. For more information, see [our blog post](/blog/ihe-ira-radiology-reporting). 
