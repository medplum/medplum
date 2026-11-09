## Usage

Any material sample:

- taken from a biological entity, living or dead
- taken from a physical object or the environment

Some specimens are biological and can contain one or more components including but not limited to cellular molecules, cells, tissues, organs, body fluids, embryos, and body excretory products (source: [NCI Thesaurus](http://ncit.nci.nih.gov/) , modified).

The specimen resource covers substances used for diagnostic and environmental testing. The focus of the specimen resource is the process for gathering, maintaining and processing the specimen as well as where the specimen originated. This is distinct from the use of [Substance](/docs/api/fhir/resources/substance) which is only used when these other aspects are not relevant.

## Background and Context

The current definition of the specimen resource contains only basic information about specimen containers. It does not address the recursive nature of containers or the tracking of the location of a container within its parent container (for instance: a tube in a tray in a rack in a freezer). The frequency with which these elements are tracked may depend on the context of use; general lab, bio-banking, etc. Comments from reviewers on the appropriate scope for this resource, and the need for tracking related specimen management attributes, are welcomed.
