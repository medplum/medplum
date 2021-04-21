# medplum

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
