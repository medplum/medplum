---
slug: dependency-warnings
title: Dependency Warnings
authors:
  name: Cody Ebberson
  title: Medplum Core Team
  url: https://github.com/codyebberson
  image_url: https://github.com/codyebberson.png
tags: [self-host]
---

# Dependency Warnings

Today, we received a thoughtful email from an engineering leader who installed Medplum for the first time:

<blockquote>
Cody,

Medplum looks like really cool and I'd like to play with for a digital health company I am helping out.

When I tried to install it I got the following problems:

```
npm WARN deprecated trim@0.0.1: Use String.prototype.trim() instead
npm WARN deprecated stable@0.1.8: Modern JS already guarantees Array#sort() is a stable sort, so this library is deprecated. See the compatibility table on MDN: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/sort#browser_compatibility
npm WARN deprecated sourcemap-codec@1.4.8: Please use @jridgewell/sourcemap-codec instead
npm WARN deprecated @npmcli/move-file@2.0.1: This functionality has been moved to @npmcli/fs
npm WARN deprecated rollup-plugin-terser@7.0.2: This package has been deprecated and is no longer maintained. Please use @rollup/plugin-terser

added 3083 packages, and audited 3134 packages in 1m

410 packages are looking for funding
run `npm fund` for details

22 vulnerabilities (9 moderate, 13 high)

To address issues that do not require attention, run:
npm audit fix

Some issues need review, and may require choosing
a different dependency.

Run `npm audit` for details.
```

Have you updated any of these? Please let me know what to do.

</blockquote>

## Our Response

This is a great question!

By engineering policy, we upgrade dependencies at minimum once per month. In practice, we upgrade dependencies roughly once per week. We are strong believers in staying current, and providing Medplum developers the best version of all tools.

Our last dependencies upgrade was just yesterday, where we upgraded all direct dependencies to latest stable/release versions: https://github.com/medplum/medplum/pull/1789

The dependencies listed in your email are transitive / indirect dependencies. You can use the "npm list" command to see the dependency tree for any given package.

- `trim` and `stable` are installed indirectly for [Docusaurus](https://docusaurus.io/) (by Meta)
- `sourcemap-codec` and `rollup-plugin-terser` are installed indirectly for [Workbox](https://developer.chrome.com/docs/workbox/) (by Google)
- `@npmcli/move-file` is installed indirectly for `npm-check-updates` (ironically, the tool that we use to upgrade dependencies)

The dependency warnings, and the output of `npm audit` in general, is sadly quite flawed. People much smarter than me have written at length about this. For example, I recommend this essay by Dan Abramov, lead engineer on React at Meta, titled [npm audit: Broken by Design](https://overreacted.io/npm-audit-broken-by-design/).

We continue to take dependency management very seriously, and use automation where possible:

- [GitHub Dependabot](https://github.com/dependabot) integration is enabled with continuous monitoring and alerts to the Medplum engineering team
- [CodeQL](https://codeql.github.com/) scans every PR
- [SonarCloud](https://www.sonarsource.com/products/sonarcloud/) scans every PR
- [Snyk](https://snyk.io/) scans every Docker image

I'd be happy to discuss further if you have any questions, or if you have any suggestions on how we can do better. [Join our Discord!](https://discord.gg/medplum)
