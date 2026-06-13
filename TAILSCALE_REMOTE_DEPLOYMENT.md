# Remote Access to the Deployment Desktop via Tailscale

A step-by-step plan for securely reaching your **deployment desktop** (the
machine you use to run Medplum deploy scripts such as `scripts/deploy-app.sh`,
`scripts/deploy-server.sh`, `scripts/cicd-deploy.sh`, etc.) from anywhere,
using [Tailscale](https://tailscale.com) — a zero-config mesh VPN built on
WireGuard.

The goal: from your laptop, phone, or any other device, you can SSH into the
deployment desktop and run deployments as if you were sitting in front of it —
without exposing any port to the public internet, and without a static IP or
port forwarding.

---

## 1. Overview & Goals

| Goal | How Tailscale delivers it |
| --- | --- |
| Reach the desktop from anywhere | Every device joins a private "tailnet" with a stable `100.x.y.z` IP and MagicDNS name |
| No public exposure | Traffic is end-to-end encrypted (WireGuard); nothing is opened to the internet |
| No router/firewall changes | NAT traversal is automatic; no port forwarding required |
| Secure shell access | Tailscale SSH handles authentication and key management |
| Survive reboots | Tailscale runs as a service and reconnects automatically |
| Auditable & revocable | Central admin console, ACLs, key expiry, device approval |

**Roles in this plan**
- **Deployment desktop** — the "server" you connect *to*. Stays online, runs deployments.
- **Client device(s)** — laptop/phone/tablet you connect *from*.

---

## 2. Prerequisites

- A Tailscale account (free **Personal** plan is sufficient for individual use).
  Sign up with an identity provider (Google, GitHub, Microsoft, etc.) at
  https://login.tailscale.com.
- Admin/sudo on the deployment desktop.
- The deployment desktop should have a remote-access daemon you want to use:
  - **SSH** (recommended for running deploy scripts) — `sshd` or Tailscale SSH.
  - Optionally **RDP** (Windows) or **VNC/RDP** (Linux/macOS) if you want a GUI.
- Decide the desktop OS — instructions below cover Linux, macOS, and Windows.

---

## 3. Architecture

```
   ┌─────────────┐         Encrypted WireGuard          ┌──────────────────────┐
   │  Laptop /    │  <───── mesh (direct or relayed) ──> │  Deployment Desktop   │
   │  Phone        │        over your "tailnet"          │  (runs deploy scripts)│
   │  100.x.x.A    │                                      │  100.x.x.B / dev-box  │
   └─────────────┘                                      └──────────────────────┘
            │                                                       │
            └──────────────── Tailscale coordination ──────────────┘
                       (control plane only — no traffic data)
```

- Devices discover each other through Tailscale's coordination server, then
  connect **directly** peer-to-peer whenever possible (DERP relays are a
  fallback when direct NAT traversal fails).
- Each device gets a private `100.64.0.0/10` (CGNAT range) IP and a MagicDNS
  name like `deploy-desktop.tailnet-name.ts.net`.

---

## 4. Set Up the Deployment Desktop (the "server")

### 4a. Install Tailscale

**Linux (Debian/Ubuntu and most distros):**
```bash
curl -fsSL https://tailscale.com/install.sh | sh
```

**macOS:** install from the [Mac App Store](https://apps.apple.com/app/tailscale/id1475387142)
or `brew install --cask tailscale`.

**Windows:** download the installer from https://tailscale.com/download/windows.

### 4b. Bring it online and enable Tailscale SSH

On Linux, start and authenticate. Enabling `--ssh` lets you SSH in using
Tailscale-managed identity (no manual key distribution):

```bash
sudo tailscale up --ssh --hostname=deploy-desktop
```

This prints a login URL — open it and approve the device in your account.

> macOS/Windows: sign in via the menu-bar/tray app. To enable Tailscale SSH
> there, run `tailscale up --ssh` from a terminal (Tailscale CLI is bundled).

### 4c. Make the device persistent and always-on

The goal is for the desktop to be reachable even after a reboot and without an
interactive login session.

**Linux** — the installer registers a systemd service; ensure it's enabled:
```bash
sudo systemctl enable --now tailscaled
```

To keep the node authenticated long-term, disable key expiry **for this
machine** in the admin console (Machines → ⋯ → *Disable key expiry*), or
re-authenticate periodically. For unattended hosts you can also start with an
**auth key** (see §8).

**macOS/Windows** — set Tailscale to *Run on login / Start at boot* and *Run
unattended* (Windows: install as a service; macOS: the standalone variant runs
as a system daemon).

Also prevent the machine from sleeping so it stays reachable:
- **Linux:** `sudo systemctl mask sleep.target suspend.target hibernate.target hybrid-sleep.target`
- **macOS:** System Settings → Energy → *Prevent automatic sleeping when the display is off* (or `sudo pmset -c sleep 0`).
- **Windows:** Power & Sleep → set Sleep to *Never* when plugged in.

### 4d. Note the address

```bash
tailscale ip -4        # e.g. 100.101.102.103
tailscale status       # shows MagicDNS names of all your devices
```

Record the MagicDNS name, e.g. `deploy-desktop` (or its full
`deploy-desktop.<tailnet>.ts.net`).

---

## 5. Set Up Your Client Device(s)

Install Tailscale on each device you'll connect *from* (laptop, phone, etc.)
using the same steps as §4a, then sign in to the **same account**:

```bash
sudo tailscale up        # Linux
# or sign in via the app on macOS/iOS/Windows/Android
```

Verify both devices see each other:
```bash
tailscale status
ping deploy-desktop      # MagicDNS resolves the name
```

---

## 6. Connect and Run Deployments Remotely

### Option A — Tailscale SSH (recommended)

With `--ssh` enabled on the desktop (§4b), simply:
```bash
ssh <your-desktop-username>@deploy-desktop
```
Tailscale authenticates you against your tailnet identity and ACLs — no SSH
keys to copy. Once in, run deployments as usual, e.g.:
```bash
cd ~/medplum
./scripts/deploy-server.sh
# or
./scripts/cicd-deploy.sh
```

> Tip: run long deployments inside `tmux` or `screen` so they survive a dropped
> connection:
> ```bash
> tmux new -s deploy
> ./scripts/deploy-app.sh        # detach with Ctrl-b d, reattach with: tmux attach -t deploy
> ```

### Option B — Standard OpenSSH over Tailscale

If you prefer your existing `sshd` + key auth, skip `--ssh` and just SSH to the
Tailscale name/IP (port 22 is reachable over the tailnet without any port
forwarding):
```bash
ssh user@deploy-desktop
```

### Option C — Graphical desktop (optional)

If you need the GUI to drive a deployment tool:
- **Windows:** RDP to `deploy-desktop:3389` (Remote Desktop must be enabled).
- **Linux/macOS:** run a VNC/RDP server and connect to the Tailscale name.

### Option D — Mobile

The Tailscale app for iOS/Android puts the desktop on your tailnet; use any SSH
client app (e.g. Termius, Blink) to connect to `deploy-desktop`.

---

## 7. Optional: Reach Other Services on the Desktop's Network

If the deployment desktop can reach internal resources (a private DB, a
registry, a staging box) that you also want from your client, advertise a
**subnet route** from the desktop:

```bash
sudo tailscale up --ssh --advertise-routes=192.168.1.0/24
```
Then approve the route in the admin console (Machines → desktop → *Edit route
settings*). Your client can now reach `192.168.1.x` through the desktop.

To route *all* your client's internet traffic through the desktop's location,
advertise it as an **exit node** (`--advertise-exit-node`) and select it on the
client.

---

## 8. Unattended Auth Keys (for headless / re-imaged desktops)

If the desktop is headless or you re-provision it often, pre-authorize it with
an **auth key** instead of the interactive login URL:

1. Admin console → *Settings* → *Keys* → *Generate auth key*.
   - Choose **reusable** if you'll register multiple machines.
   - Consider **ephemeral** only for throwaway nodes (it auto-removes when
     offline) — *not* for a persistent deployment desktop.
   - Optionally tag it (e.g. `tag:deploy`) to drive ACLs (§9).
2. Bring the node up non-interactively:
   ```bash
   sudo tailscale up --ssh --authkey=tskey-xxxxxxxxxxxx --hostname=deploy-desktop
   ```

> Treat auth keys like secrets — never commit them to the repo. Use an env var
> or secret store. They are short-lived by default; set an appropriate
> expiry.

---

## 9. Security Hardening

Tailscale is private by default, but tighten it for a machine that can deploy
production infrastructure:

- **ACLs (least privilege).** In the admin console *Access Controls*, restrict
  who/what can reach the desktop and over which ports. Example policy granting
  only your user SSH access to a tagged deploy box:
  ```jsonc
  {
    "tagOwners": { "tag:deploy": ["your-email@example.com"] },
    "acls": [
      { "action": "accept",
        "src": ["your-email@example.com"],
        "dst": ["tag:deploy:22"] }
    ],
    "ssh": [
      { "action": "check",                       // require re-auth ("check") for SSH
        "src": ["your-email@example.com"],
        "dst": ["tag:deploy"],
        "users": ["autogroup:nonroot", "ubuntu"] }
    ]
  }
  ```
  Using `"action": "check"` forces periodic re-authentication before SSH
  sessions; use `"accept"` for no prompt.
- **MFA** on your Tailscale identity provider — this is the front door to the tailnet.
- **Key expiry / device approval.** Keep key expiry *on* where practical, and
  enable *device approval* so new machines must be admitted manually.
- **Tailnet Lock** (advanced) — cryptographically prevents the coordination
  server from adding rogue nodes; worthwhile for production-deploying hosts.
- **Host firewall.** Optionally restrict the desktop's `sshd`/RDP to only the
  Tailscale interface (`tailscale0` / the `100.64.0.0/10` range) so it never
  listens on the public LAN.
- **Least-privilege deploy user.** Run deployments as a dedicated, non-root
  user with only the cloud credentials it needs; avoid logging in as root.
- **Audit.** The admin console logs device connections; consider enabling
  configuration audit logging.

---

## 10. Keep It Healthy

- **Updates:** keep Tailscale current (`sudo tailscale update` on Linux, or app
  auto-update).
- **Health check:** `tailscale status` and `tailscale netcheck` diagnose
  connectivity and NAT type.
- **Re-auth reminders:** if you kept key expiry on, set a calendar reminder to
  re-run `tailscale up` before expiry, or the desktop will drop off the tailnet.
- **Monitoring:** optionally have the desktop ping a heartbeat (or use an uptime
  monitor reachable over the tailnet) so you know if it goes offline.

---

## 11. Troubleshooting

| Symptom | Check |
| --- | --- |
| Can't resolve `deploy-desktop` | Ensure **MagicDNS** is enabled (admin console → DNS); try the raw `100.x` IP |
| Connection drops on the desktop's reboot | Confirm `tailscaled` service is enabled and key expiry handling (§4c/§8) |
| SSH refused | Confirm `--ssh` was used *and* ACL `ssh` rules permit your user; or that `sshd` is running for Option B |
| Slow / relayed connection | `tailscale netcheck` — restrictive NAT may force DERP relay; usually still works, just higher latency |
| Device offline after a while | Key expired, machine asleep, or daemon stopped — see §4c |
| Lost session mid-deploy | Use `tmux`/`screen` (§6) so the job keeps running server-side |

---

## 12. Quick Reference

```bash
# On the deployment desktop (one-time)
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up --ssh --hostname=deploy-desktop
sudo systemctl enable --now tailscaled
tailscale ip -4

# On each client
sudo tailscale up
tailscale status

# Connect and deploy
ssh you@deploy-desktop
tmux new -s deploy
cd ~/medplum && ./scripts/deploy-server.sh
```

---

### Summary checklist

- [ ] Tailscale account created (with MFA)
- [ ] Tailscale installed + `--ssh` on the deployment desktop
- [ ] Desktop set to start on boot, not sleep, key expiry handled
- [ ] Tailscale installed on client device(s), same account
- [ ] `tailscale status` shows both; `ssh deploy-desktop` works
- [ ] ACLs scoped to least privilege
- [ ] Deployments run inside `tmux`/`screen`
- [ ] (Optional) subnet routes / exit node / Tailnet Lock configured
