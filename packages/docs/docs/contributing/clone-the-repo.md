---
sidebar_position: 10
---

# Clone the repo

Ah, you're ready to get your hands dirty, eh? Great! Let's get you setup with a cloned repo.

The first step is to clone our [Github Repository](https://github.com/medplum/medplum)

To clone the repo, run the following command in your terminal:

```bash
git clone git@github.com:medplum/medplum.git medplum
```

If you get an error saying `Permission denied` using `ssh`, you can refer to the [Github docs on setting up SSH keys](https://help.github.com/articles/error-permission-denied-publickey/).

Alternatively, you can use the `https` method as a fallback.

```sh
git clone https://github.com/medplum/medplum.git medplum
```

That will create a complete copy of the project source code on your local machine, including code for the Medplum Server, Medplum App, and associated libraries.

In the next step, we'll build the application and run the tests.
