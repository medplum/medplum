---
sidebar_position: 200
---

# Manual Uninstall

The official agent installer for Microsoft Windows includes an uninstaller. However, if you need to manually uninstall the agent, follow these steps.

## Delete the Agent Service

As an administrator, open a command prompt and run:

```bash
sc.exe stop MedplumAgent
sc.exe delete MedplumAgent
```

## Delete the Agent Files

:::info

Make sure the agent is stopped and deleted before attempting to delete the files.

:::

:::warning

This will delete all configuration files and log data.

:::

As an administrator, delete all files in the following directories:

1. `C:\Program Files\MedplumAgent`
2. `C:\Users\$USERNAME\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Medplum Agent`

## Delete the Agent Registry Keys

As an administrator, open the registry editor and delete the following keys (if they exist):

1. `HKEY_LOCAL_MACHINE\SYSTEM\CurrentControlSet\Services\MedplumAgent`
2. `HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\MedplumAgent`
