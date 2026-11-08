## Usage

The [MolecularSequence](/docs/api/fhir/resources/molecularsequence) resource is designed to describe an atomic sequence which contains the alignment sequencing test result and multiple variations. Atomic sequences can be connected by link element and they will lead to sequence graph. By this method, a sequence can be reported. Complete genetic sequence information, of which specific genetic variations are a part, is reported by reference to the GA4GH repository. Thus, the FHIR [MolecularSequence](/docs/api/fhir/resources/molecularsequence) resource avoids large genomic payloads in a manner analogous to how the FHIR [ImagingStudy](/docs/api/fhir/resources/imagingstudy) resource references large images maintained in other systems. For use cases, details on how this resource interact with other Clinical Genomics resources or profiles, please refer to implementation guidance document [here](https://www.hl7.org/fhir/genomics.html).

#### Genetic Standards and Resources include:[](https://www.hl7.org/fhir/molecularsequence.html#10.6.1.1 'link to here')

- Variant Databases: [dbSNP](http://www.ncbi.nlm.nih.gov/projects/SNP/snp_ref.cgi) , [ClinVar](http://www.ncbi.nlm.nih.gov/clinvar/) , and [COSMIC](http://cancer.sanger.ac.uk/cosmic/)
- Reference Sequences: [RefSeq](http://www.ncbi.nlm.nih.gov/refseq/) and [ENSEMBL](http://www.ensembl.org/index.html)

This resource is designed to describe sequence variations with clinical significance with information such as:

- Name of the variation represented
- Type of the variation
- Gene region occupied by the variation
- Tissue source used to determine genotype of the variation
- Quality of the result

It is strongly encouraged to provide all available information in this resource for any reported variants, because receiving systems (e.g. discovery research, outcomes analysis, and public health reporting) may use this information to normalize variants over time or across sources. However, these data should not be used to dynamically correct/change variant representations for clinical use outside of the laboratory, due to insufficient information.

Implementers should be aware that semantic equivalency of results of genetic variants cannot be guaranteed unless there is an agreed upon standard between sending and receiving systems.

## Relationships

Focus of the resource is to provide sequencing alignment data immediately relevant to what the interpretation on clinical decision-making originates from. Hence data such as precise read of DNA sequences and sequence alignment are not included; such data are nonetheless accessible through references to [GA4GH](http://ga4gh.org/#/) (Global Alliance for Genomics and Health) API. The [MolecularSequence](/docs/api/fhir/resources/molecularsequence) resource will be referenced by [Observation](/docs/api/fhir/resources/observation) to provide variant information. As clinical assessments/diagnosis of a patient are typically captured in the [Condition](/docs/api/fhir/resources/condition) resource or the [ClinicalImpression](/docs/api/fhir/resources/clinicalimpression) resource, the [MolecularSequence](/docs/api/fhir/resources/molecularsequence) resource can be referenced by the [Condition](/docs/api/fhir/resources/condition) resource to provide specific genetic data to support assertions. This is analogous to how [Condition](/docs/api/fhir/resources/condition) references other resources, such as [AllergyIntolerance](/docs/api/fhir/resources/allergyintolerance), [Procedure](/docs/api/fhir/resources/procedure), and [Questionnaire](/docs/api/fhir/resources/questionnaire) resources.
