# Medplum Agent: Secure Bridge for Legacy Healthcare Systems

Healthcare organizations need to integrate HL7, DICOM, and other legacy protocols that operate within closed networks—but maintaining site-to-site VPNs is complex and costly, and legacy integration engines may not be flexible and cloud-first in architecture. The Medplum Agent eliminates these issues while preserving security and compliance.

## How It Works

The Medplum Agent is a lightweight, open-source service that runs in your local network and converts legacy protocols into secure, encrypted websockets. Your transformation logic runs in Medplum's cloud using modern TypeScript/JavaScript Bots, while the Agent handles the protocol translation locally. The Medplum platform also supports [remote monitoring and upgrade features](/docs/agent/features). 

**Supported protocols:**
- HL7v2
- DICOM  
- ASTM (coming soon)

**Runs on:** Any currently supported operating system version (Windows, Linux, macOS)

## Open Source and Secure

**"Is it secure even though it's open source?"**

Yes. All code contributed to Medplum—whether from employees, customers, or community members—is:
- Automatically scanned for security vulnerabilities
- Manually reviewed by Medplum maintainers before release
- Subject to weekly dependency upgrades and proactive security maintenance

The Agent maintains:
- **End-to-end encryption** using TLS/SSL protocols (HTTPS to WSS)
- **HIPAA and SOC2 Type 2 compliance** 
- **Modern security practices** through continuous updates

Our Apache 2 license means no vendor lock-in and full transparency into how your infrastructure operates.

## Roles and Responsibilities

Understanding who manages what is critical for healthcare organizations:

### Medplum Team
Develops and releases the Medplum platform and Agent

### Service Provider  
Consumes the Medplum platform and has administrative control over Agent remote monitoring and upgrade operations

### IT/Security (on-prem) Team
Responsible for Agent installation in your local network, security policies, and update approval workflows

The Service Provider maintains administrative control over remote operations, such as automatic upgrades and configuration updates. For specific details on auto-update configuration and security controls in your environment, coordinate with your Service Provider.

## Updates and Versioning

The Medplum Agent follows our general [Medplum versioning policy](/docs/compliance/versions). The Agent does not require server maintenance or database migrations—minor versions can be deployed directly without intermediate steps.

Agent updates can be managed through remote upgrade features, with control maintained by your Service Provider. Healthcare organizations can coordinate with their Service Provider on update approval workflows and timing based on their specific security policies and operational requirements.

## Performance

Benchmarked HL7 throughput using Original and [Enhanced Acknowledgement](/docs/agent/acknowledgement-modes#enhanced-acknowledgement-mode-fast-ack) Modes:

| Mode | Cross-Network | Same Machine |
|------|---------------|--------------|
| Original | 7 msg/sec | 174 msg/sec |
| Enhanced (Fast ACK) | ~9,000 msg/sec | ~10,000 msg/sec |

*Cross-network simulates real-world latency to cloud; same machine simulates private network scenarios. Note that throughput is significantly influenced by network latency in cross-network scenarios.*

## Modern Alternative to Mirth Connect

Following NextGen's announcement regarding Mirth Connect, healthcare organizations are evaluating alternatives. Medplum offers:

- **Cloud-native architecture** with local protocol support
- **Modern TypeScript/JavaScript** (not aging Java/Rhino)
- **Continuous updates** with proactive security maintenance  
- **Apache 2 licensed** open source
- **FHIR-native** with legacy format support

[Read our full comparison for Mirth users →](/blog/medplum-for-mirth-users)

## Get Started

- [Agent documentation](/docs/agent)
- [Remote monitoring features](/docs/agent/features)
- [Acknowledgement modes guide](/docs/agent/acknowledgement-modes)
- [Migrating from Mirth Connect](/blog/medplum-for-mirth-users)
- [Try our sandbox](https://app.medplum.com/register)

Questions? Join our [Discord community](https://discord.gg/medplum) or [contact our team](mailto:support@medplum.com).