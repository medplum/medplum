# Medplum

Medplum is a healthcare platform that helps you quickly develop high-quality compliant applications.  Medplum includes a FHIR server, React component library, and developer console.

## Projects

Medplum uses a [monorepo](https://en.wikipedia.org/wiki/Monorepo) structure.
Here is a quick summary of the subprojects:

| Folder               | Language     | Type     | Port  | Description                            |
| -------------------- | ------------ | -------- | ----- | -------------------------------------- |
| `medplum-console`    | TypeScript   | App      | 3000  | Developer console application          |
| `medplum-core`       | Java         | Library  |       | Java client library                    |
| `medplum-generator`  | Java         | App      |       | Code generator                         |
| `medplum-graphiql`   | TypeScript   | App      | 8080  | GraphQL debug tool                     |
| `medplum-server`     | Java         | App      | 5000  | Main server application                |
| `medplum-ts`         | TypeScript   | Library  |       | TypeScript client library              |
| `medplum-ui`         | TypeScript   | Library  | 6006  | React component library and Storybook  |

## Getting Started

These instructions will get you a copy of the project up and running on your local machine for development and testing purposes. See deployment for notes on how to deploy the project on a live system.

### Prerequisites

* Java 11+
* Maven
* Node/npm
* Postgres

### Installing

Install and build the Maven projects:

```
mvn clean install
```

Install and build the Node projects:

```
npm ci
npm run build --workspaces
```

Run the FHIR server:

```
cd medplum-server
mvn exec:java
```

Run the console:

```
cd medplum-console
npm run dev
```

## Maven Cheatsheet

| Task                          | Command                                                  |
| ----------------------------- | -------------------------------------------------------- |
| Clean                         | `mvn clean`                                              |
| Build                         | `mvn build`                                              |
| Show all dependencies         | `mvn dependency:tree`                                    |
| Analyze unused dependencies   | `mvn dependency:analyze`                                 |
| Check for dependency updates  | `mvn versions:display-dependency-updates`                |
| Check for plugin updates      | `mvn versions:display-plugin-updates`                    |
| Sort pom.xml files            | `mvn com.github.ekryd.sortpom:sortpom-maven-plugin:sort` |

## NPM Cheatsheet

| Task                          | Command                                                  |
| ----------------------------- | -------------------------------------------------------- |
| Install                       | `npm ci`                                                 |
| Clean                         | `npm run clean --workspaces`                             |
| Build                         | `npm run build --workspaces`                             |
