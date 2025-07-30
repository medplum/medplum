---
sidebar_position: 60
---

# Working with package.json

The Medplum codebase uses NPM workspaces to manage approximately 50 packages in a single monorepo. This structure provides many benefits but can be confusing when it comes to dependency management. This guide explains best practices for working with dependencies in our monorepo.

## Key Concepts

### Always Run npm Commands from the Root

```bash
# ✅ DO run npm commands from the project root
cd ~/dev/medplum
npm ci

# ❌ DON'T run npm commands from package directories
cd ~/dev/medplum/packages/core
npm i  # DON'T do this!
```

Package dependency relationships are managed at the workspace level, and running npm commands in individual package directories can break the workspace structure.

### Prefer `npm ci` Over `npm i`

```bash
# ✅ Preferred installation method
npm ci
```

The `npm ci` (clean install) command:

- Uses the exact versions in `package-lock.json`
- Ensures you're using dependencies that have been tested in CI/CD
- Deletes the existing `node_modules` folder to ensure clean installation
- Is faster for fresh installs in most cases

### Use the Reinstall Script for Clean Installations

```bash
# For a completely clean installation
./scripts/reinstall.sh
```

This script:

1. Recursively deletes all `node_modules` folders in the project
2. Runs `npm ci --strict-peer-deps` to ensure peer dependency conflicts are caught immediately

### Never Force Install Dependencies

```bash
# ❌ DON'T use these commands
npm install --force
npm install --legacy-peer-deps
```

These flags bypass important dependency checks and can lead to unpredictable behavior, failed builds, and time-consuming debugging sessions.

## Adding New Dependencies

Adding dependencies in a monorepo is different from a regular npm project:

1. **Don't** use `npm i [package-name]` directly
2. **Do** manually add the dependency to the appropriate package.json file:

```js
// Example: Adding a dependency to packages/core/package.json
{
  "dependencies": {
    "existing-dependency": "1.0.0",
    "new-dependency": "2.0.0" // Manually add this line
  }
}
```

3. Check if other packages use the same or similar dependency and try to align versions
4. After manually updating package.json, run from the project root:

```bash
cd ~/dev/medplum
npm i --strict-peer-deps
```

Or use the reinstall script with the update flag:

```bash
./scripts/reinstall.sh --update
```

## Package.json Best Practices

- Always use exact version strings (not ranges):

  ```js
  // ✅ DO use exact versions
  "dependency": "1.2.3"

  // ❌ DON'T use version ranges
  "dependency": "^1.2.3"
  ```

- The exception is for peerDependencies, which should use broader ranges:

  ```js
  "peerDependencies": {
    "react": "^17.0.2 || ^18.0.0"
  }
  ```

- Keep dependencies in alphabetical order
- Follow conventions from existing packages when creating new ones
- Use our package.json formatter:

```bash
npm run sort-package-json
```

> **Note:** Adding peer dependencies is an advanced topic. Please consult with the core engineering team before adding any peer dependencies to packages.

## Dependency Update Policy

Medplum automatically upgrades dependencies every Monday:

1. GitHub Actions run on a cron timer (early Monday morning Pacific Time)
2. The process:
   - Creates a new git branch
   - Attempts minor upgrades using `npm-check-updates`
   - Installs updates with `./scripts/reinstall.sh --update`
   - Attempts major upgrades using `npm-check-updates`
   - Installs updates again

Given this automatic process, we typically don't upgrade dependencies outside this schedule unless there's a critical security issue or must-have feature.

## Pull Request Checklist

When preparing a pull request that involves dependency changes:

- If you modified a `package.json` file, there should typically be corresponding changes in `package-lock.json`
- If you didn't modify any `package.json` files, there likely shouldn't be changes to `package-lock.json`
- There should only be one `package-lock.json` file (in the root directory)

## Common Troubleshooting

### Issue: "Unable to resolve dependency tree" Error

This usually indicates a peer dependency conflict. Try:

```bash
./scripts/reinstall.sh
```

### Issue: Local Changes to package-lock.json That You Didn't Intend

This can happen if you accidentally ran `npm install` in a package directory. Reset with:

```bash
git checkout -- package-lock.json
./scripts/reinstall.sh
```

### Issue: Unexpected behavior after adding dependencies

Ensure you've run the reinstall script from the root directory:

```bash
./scripts/reinstall.sh --update
```

## Need Help?

If you have questions about dependency management in the Medplum monorepo, please ask in:

- Discord: [Medplum community server](https://discord.gg/medplum)
- Slack: [#eng](https://medplum.slack.com/archives/C051SKJKZ50) channel
