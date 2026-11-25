---
id: dco
title: Developer Certificate of Origin
---

At Medplum, we've enabled the Developer Certificate of Origin (DCO) for all contributions to our repositories. This means every commit to the Medplum codebase needs to be "signed off" by the author. We understand this might be a new process for some, and we're here to help you get started.

## What is DCO and Why Do We Use It?

The **Developer Certificate of Origin (DCO)** is a lightweight attestation from a contributor that certifies they have the right to submit the code they are contributing to the project. It's an industry-standard practice in many open-source projects, including the Linux kernel, to ensure a clear chain of ownership and licensing.

Instead of a formal Contributor License Agreement (CLA) that requires a separate legal agreement, the DCO works by adding a simple line to your commit message:

```
Signed-off-by: Your Name <your.email@example.com>
```

By including this line, you are certifying that:

1.  **You created the contribution** in whole or in part, and you have the right to submit it under the project's open-source license.
2.  **The contribution is based on previous work** that, to the best of your knowledge, is covered under an appropriate open-source license, and you have the right to submit that work with modifications.
3.  **You understand and agree** that this project and your contribution are public and that a record of your contribution (including your sign-off) is maintained indefinitely and may be redistributed.

### Why Medplum Requires DCO

As an open-source healthcare developer platform, maintaining a clear and verifiable history of contributions is crucial for Medplum. DCO helps us:

- **Protect our users and ourselves:** It minimizes legal risks related to intellectual property and licensing, ensuring that all code contributed to Medplum can be freely used and distributed under our chosen open-source license.
- **Maintain transparency:** It provides a transparent record of who contributed what, which is essential for community trust and accountability.
- **Streamline contributions:** It's a less burdensome alternative to a full CLA, making it easier for new contributors to get involved without extensive legal overhead.

---

## How to Sign Off Your Commits

The DCO sign-off needs to be present on _every commit_ in a pull request. Here are the simplest ways to ensure your commits are signed off:

### 1\. Signing Off New Commits (Recommended)

The easiest way to sign off your commits is to use the `-s` or `--signoff` flag with your `git commit` command. This automatically appends the `Signed-off-by:` line using your Git configured user name and email.

First, make sure your Git user name and email are correctly configured:

```bash
git config --global user.name "Your Name"
git config --global user.email "your.email@example.com"
```

Then, for new commits:

```bash
git commit -s -m "Your commit message here"
```

If you prefer the verbose option:

```bash
git commit --signoff -m "Your commit message here"
```

### 2\. Fixing Existing Commits (If You Forgot)

It's common to forget the `-s` flag, especially when you're just getting used to it. If the DCO check fails on your pull request, use one of these options.

#### Option A: Add a Remediation Commit (No Force Push)

Add one empty commit that signs off each commit that is missing a sign-off. This doesn't rewrite history, so it works even if a maintainer has already pushed commits to your branch.

```bash
git commit --allow-empty -s -m "DCO Remediation Commit for Your Name <your.email@example.com>

I, Your Name <your.email@example.com>, hereby add my Signed-off-by to this commit: <commit-sha>
I, Your Name <your.email@example.com>, hereby add my Signed-off-by to this commit: <another-commit-sha>"
git push
```

Use one `I, ...` line per commit. The name and email must exactly match the author of each commit. The DCO check's details page lists the commits that need a sign-off.

#### Option B: Rebase With Sign-Off

To add the sign-off directly to your existing commits, rebase onto the point where your branch started, then force push:

```bash
git rebase --signoff HEAD~3
git push --force-with-lease
```

Replace `3` with the number of commits in your pull request, shown on its "Commits" tab. This rewrites history on your branch, so pull any commits that others have pushed to it first.

---

## Tips and Tricks for Convenience

While there's no single `git config` option to _always_ sign off every commit automatically, here are some helpful tricks:

### 1\. Git Alias for Signed Commits

This is a popular solution. You can create a Git alias that includes the `-s` flag, giving you a shorter, more memorable command for signed commits.

To set up a global alias for `scommit`:

```bash
git config --global alias.scommit 'commit -s'
```

Now, instead of `git commit -s -m "..."`, you can just type:

```bash
git scommit -m "Your commit message here"
```

### 2\. Git Hooks (Advanced)

For more advanced users, you can use a Git hook, specifically the `prepare-commit-msg` hook, to automatically add the `Signed-off-by:` line if it's missing. This would be a per-repository setup.

To do this, create or edit the file `.git/hooks/prepare-commit-msg` in your repository and add the following script:

```bash
#!/bin/sh
NAME=$(git config user.name)
EMAIL=$(git config user.email)

if [ -z "$NAME" ] || [ -z "$EMAIL" ]; then
  echo "Error: Git user.name and user.email must be configured for DCO sign-off."
  exit 1
fi

if ! grep -qs "^Signed-off-by:" "$1"; then
  printf "\nSigned-off-by: %s <%s>\n" "$NAME" "$EMAIL" >> "$1"
fi
```

Make sure the hook is executable:

```bash
chmod +x .git/hooks/prepare-commit-msg
```

This script will check if a `Signed-off-by:` line exists and add it if not. It will also ensure your `user.name` and `user.email` are set.
