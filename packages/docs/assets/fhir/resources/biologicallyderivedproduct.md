## Usage

> **Trial-Use Note:** **Note that this content is preliminary has not undergone proper review by the appropriate Workgroups.**

A material substance originating from a biological entity intended to be transplanted or infused into another (possibly the same) biological entity.

Examples include:

- hematopoietic stem cells (bone marrow, peripheral blood, or cord blood extraction)
- blood (whole, extracted cells, plasma, etc.)
- organs
- tissues (porcine valves, skin, bovine cardiac tissue, etc.)
- manipulated cells (e.g. CAR T-cells)

The workflow using this resource (e.g., request, administration) should be discussed and implemented in a consistent way as other similar resources are handled (e.g., device, medication)

## Relationships

This resource relates to these other resource:

- ProcedureRequest (for collection)
- Patient ("receiver" and "source")
- Practitioner (who collected product)
- Substance (product processing)
- DiagnosticReport (containing HLA-typing)
- BiologicallyDerivedProduct ("parent" product for multi-day collections)
- Procedure (one for collection and one for transplantation, will need to add [BiologicallyDerivedProduct](/docs/api/fhir/resources/biologicallyderivedproduct) to the "usedReference")
