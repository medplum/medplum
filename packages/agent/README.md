# Medplum Agent

On-prem agent for device connectivity.

> [!WARNING]
> The Medplum Agent is currently in "alpha", and not ready for production use.
>
> Please [contact Medplum](mailto:hello@medplum.com) if you would like to learn more or get involved.

## Building

Build everything:

```bash
npm run build:all
```

Or, build individual components:

Build the JS output:

```bash
npm run build
```

Build the `.exe` file using [Vercel `pkg`](https://github.com/vercel/pkg):

```bash
npm run build:exe
```

Build the installer using [NSIS](https://nsis.sourceforge.io/) (requires `makensis` on your PATH):

```bash
npm run build:installer
```
