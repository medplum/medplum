# MedPlum

MedPlum is a healthcare platform that helps you quickly develop high-quality compliant applications.  MedPlum includes a FHIR server, React component library, and developer console.

## Getting Started

These instructions will get you a copy of the project up and running on your local machine for development and testing purposes. See deployment for notes on how to deploy the project on a live system.

### Prerequisites

* Java 11+
* Maven
* Node/npm
* Lerna
* Postgres

### Installing

Install and build the Maven projects:

```
mvn clean install
```

Install and build the Node projects:

```
lerna bootstrap
lerna run build
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

| Task                          | Command                                                      |
| ----------------------------- | ------------------------------------------------------------ |
| Clean                         | `mvn clean`                                              |
| Build                         | `mvn build`                                              |
| Replicate Jenkins build       | `mvn clean install site`                                 |
| Show all dependencies         | `mvn dependency:tree`                                    |
| Analyze unused dependencies   | `mvn dependency:analyze`                                 |
| Check for dependency updates  | `mvn versions:display-dependency-updates`                |
| Check for plugin updates      | `mvn versions:display-plugin-updates`                    |
| Sort pom.xml files            | `mvn com.github.ekryd.sortpom:sortpom-maven-plugin:sort` |

## TODO:

* Auth
* Compartment access controls
* Batch processing
* Bundle transactions
* Binary/blob storage
* Reference integrity
* Synthea support
* Inferno support
* SMART-on-FHIR
* [UDAP](https://www.udap.org/)
* Version Mapping

## Blog posts

* Naming conventions
* Domain conventions
* Dependencies
* Security review
* Pen test
* OpenID compliance
* FHIR/Inferno compliance
* DICOM FDA application
