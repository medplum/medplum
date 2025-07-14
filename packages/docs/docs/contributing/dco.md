# Developer Certificate of Origin

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

It's common to forget the `-s` flag sometimes, especially when you're just getting used to it. Don't worry, you can fix it\!

#### Option A: Amending the Last Commit

If you only forgot the sign-off on your very last commit and haven't pushed it yet:

```bash
git commit --amend --signoff
```

This command will open your commit message in an editor, where you'll see the `Signed-off-by:` line automatically added. Save and close the editor. If you've already pushed this commit, you'll need to force push:

```bash
git push -f origin your-branch-name
```

**Use `git push -f` with caution\!** Force pushing overwrites history on the remote branch. Only do this if you are sure no one else has based work off your branch.

#### Option B: Rebasing to Sign Off Multiple Commits

If you have multiple commits in your branch that are missing the sign-off, you'll need to perform an interactive rebase. This allows you to rewrite the history of your commits.

Let's say you want to sign off the last 3 commits. Replace `HEAD~3` with the appropriate number of commits you need to rebase:

```bash
git rebase -i HEAD~3
```

This will open an editor showing your last N commits. Change `pick` to `reword` (or `r`) next to each commit you want to modify.

```
pick a1b2c3d Commit 1 message
pick e4f5g6h Commit 2 message
pick i7j8k9l Commit 3 message
```

Change to:

```
reword a1b2c3d Commit 1 message
reword e4f5g6h Commit 2 message
reword i7j8k9l Commit 3 message
```

Save and close the editor. Git will then go through each commit one by one, opening your editor for you to modify the commit message. For each one, add the `-s` flag to the `git commit` command that appears:

```bash
git commit -s --amend
```

After modifying all the commits, you'll need to force push your branch:

```bash
git push -f origin your-branch-name
```

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
