# Release binary drop dir

`mock-releases` mounts this directory read-only at `/releases` and scans it on
every manifest request. Drop binaries here following the agent's canonical
naming:

- `medplum-agent-{version}-linux` (the file BinaryAgentLauncher pulls)
- `medplum-agent-installer-{version}.exe` (Windows installer flow)
- `medplum-agent-{version}-darwin` (when published; not currently shipped)

Version must match the semver pattern enforced by `@medplum/core`:
`X.Y.Z` or `X.Y.Z-<7charhex>`.

Example:

```sh
# Stand in a fake linux binary so the agent's BinaryAgentLauncher sees a
# manifest it can parse + a download URL it can fetch.
printf '#!/bin/sh\nsleep infinity\n' > medplum-agent-4.5.0-linux
chmod +x medplum-agent-4.5.0-linux
```

For real upgrade tests, copy actual historical `medplum-agent-{version}-linux`
binaries here — they'll execute inside the `harness` container (linux/amd64)
when an upgrade is triggered against the simulated meta.medplum.com.
