---
sidebar_position: 3
---

# System Requirements

Medplum publishes an official agent installer for Microsoft Windows.

To install on a Windows Host, remote into the host and download the agent executable to the host filesystem. Double click on the MSI to start and go through the install screen, inputting the 4 pieces of information from the previous step into the screen.

The agent executable for Windows is built with each release, and can be be downloaded from the [releases](https://github.com/medplum/medplum/releases) page.

### Operating System (OS)

- **Minimum OS**: Microsoft Windows 8.1 or Windows Server 2012 R2
- **Recommended OS**: Microsoft Windows 11 or Windows Server 2022

### Random Access Memory (RAM)

- **Minimum RAM**: 512 MB - Adequate for small-scale applications with minimal processing demands.
- **Recommended RAM**: 2 GB or more - Advisable for applications that manage extensive in-memory operations, exhibit high levels of user concurrency, or execute multiple background processes.

### Central Processing Unit (CPU)

- **Minimum CPU**: 1 GHz or faster processor, 64-bit (x64) architecture. Single-core CPUs are capable of running Node.js; however, performance may be limited under intensive workloads.
- **Recommended CPU**: Multi-core processor (2 cores or more). Node.js inherently operates on a single thread, but it can leverage multi-core systems using the cluster module, facilitating concurrent processing and enhancing throughput.

### Disk Storage

- **Minimum Disk Space**: 100-200 MB - Sufficient for the Node.js runtime environment and a basic application footprint.
- **Recommended Disk Space**: 1 GB or greater - Recommended to accommodate application dependencies, log files, user data, and temporary files. Solid State Drives (SSDs) are preferable for improved read/write performance, which is particularly beneficial when the application frequently accesses the disk.

---

**Note**: These specifications represent a baseline that should ensure the functional operation of a standard Node.js application. Actual requirements may vary based on specific application characteristics and workload conditions. We recommend conducting performance evaluations to fine-tune these recommendations to match the application's production environment and anticipated usage patterns.
