---
sidebar_position: 1
---

# Contributing to Medplum

Medplum is an open-source project, and we love both code and non-code contributions! People with any level of experience
can make an important impact on the project: you don't need to be a professional developer! You might have just:

- **Ten minutes** to write a GitHub issue describing a bug you found or request for a feature you could use
- **One hour** to learn and participate in one of our webinars
- **Four hours** to author a case study showcasing how you've used Medplum

This section provides instructions on how to get started contributing to the Medplum project.
If you're looking to _use_ Medplum, check out the [App](./app) or [API](./api) docs instead.

## Join our online community

We have several online venues where Medplum community members and team members convene, offering various ways
to get involved with the project:

1. Star the [Medplum Github repository](https://github.com/medplum/medplum)
2. Join our [Discord channel](https://discord.gg/medplum) - and introduce yourself
3. Subscribe to [Medplum on LinkedIn](https://www.linkedin.com/company/medplum)
4. Follow [Medplum on Twitter](https://twitter.com/Medplum1)
5. Subscribe to our [Youtube channel](https://www.youtube.com/channel/UCu_sS6aXEHz3GPk2NTugtJA)

### Spread the word and participate

Help us reach and engage people passionate about building amazing healthcare solutions!

1. Let us know your thoughts on [Github Discussions](https://github.com/medplum/medplum/discussions)
2. Share our [blog posts](/blog)
3. Share code, posts, videos or other content in relevant online forums for example [dev.to](https://dev.to/),
   [/r/healthIT](https://www.reddit.com/r/healthIT/), [/r/selfhosted](https://www.reddit.com/r/selfhosted/),
   or [Hacker News](https://news.ycombinator.com)
4. Write content for your own blog or website, and [tell us about it](mailto:hello@medplum.com)

## Making a contribution

There are several ways to make your first contribution to the Medplum project! The following instructions
should help you get started.

### Reporting a bug or discussing a feature idea

If you found a technical bug on Medplum or have ideas for features we should implement, the [GitHub issue tracker](https://github.com/medplum/medplum/issues)
is the best place to share your ideas.
[Open a new issue](https://github.com/medplum/medplum/issues/new) describing the changes you'd like to see, and one of
our team members will respond.

### Writing documentation or blog content

Did you learn how to do something using Medplum but it wasn't obvious on first try? Please contribute to our documentation!

Our documentation is hosted on [medplum.com/docs](/docs), but it is built from [Markdown](https://www.markdownguide.org/)
files that live in our [Github repository](https://github.com/medplum/medplum/tree/main/packages/docs/docs).

For relatively small changes, you can edit files directly from your web browser on [github.dev](https://github.dev/medplum/medplum/blob/main/packages/docs/docs/home)
without needing to clone the repository.

### Fixing a bug or implementing a new feature

Every community pull request needs an associated GitHub issue. Medplum uses a [vouch](https://github.com/mitchellh/vouch) system so we can discuss scope and approach before reviewing code.

Please do not open a PR first. Instead:

1. Find an existing issue, or [open a new one](https://github.com/medplum/medplum/issues/new) describing the bug or feature.
2. Comment on the issue with your proposed approach. A maintainer will add the [`open-to-community`](https://github.com/medplum/medplum/issues?q=is%3Aissue+is%3Aopen+label%3Aopen-to-community) label once there is enough context for a community PR to land.
3. Open your PR and **link it to that issue** with `Fixes #…` or `Closes #…` in the description, or via GitHub's Development panel.

PRs from contributors who are not yet vouched, and that are not linked to an `open-to-community` issue, are closed automatically. If that happens, link the PR to a labeled issue and reopen it.

Issues that are already a good fit:

- [Good first issue](https://github.com/medplum/medplum/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22) — beginner-friendly
- [Open to community](https://github.com/medplum/medplum/issues?q=is%3Aissue+is%3Aopen+label%3Aopen-to-community) — reasonably well-scoped work we have invited community PRs for

**Ready to get started writing code?** First things first, you need to [clone the Medplum repository](./contributing/local-dev-setup).

:::note[Legal Note]

By submitting content to this project, you agree to adopt the [Developer Certificate of Origin (DCO)](https://developercertificate.org/) for your contributions.

All conversations and communities on Medplum are expected to follow GitHub's [Community Guidelines](https://help.github.com/en/github/site-policy/github-community-guidelines)
and [Acceptable Use Policies](https://help.github.com/en/github/site-policy/github-acceptable-use-policies).

:::
