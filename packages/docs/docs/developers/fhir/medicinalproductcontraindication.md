---
title: MedicinalProductContraindication
sidebar_position: 409
---

# MedicinalProductContraindication

The clinical particulars - indications, contraindications etc. of a medicinal product, including for regulatory purposes.

## Properties

| Name                  | Card  | Type            | Description                                                                                                           |
| --------------------- | ----- | --------------- | --------------------------------------------------------------------------------------------------------------------- |
| id                    | 0..1  | string          | Logical id of this artifact                                                                                           |
| meta                  | 0..1  | Meta            | Metadata about the resource                                                                                           |
| implicitRules         | 0..1  | uri             | A set of rules under which this content was created                                                                   |
| language              | 0..1  | code            | Language of the resource content                                                                                      |
| text                  | 0..1  | Narrative       | Text summary of the resource, for human interpretation                                                                |
| contained             | 0..\* | Resource        | Contained, inline Resources                                                                                           |
| extension             | 0..\* | Extension       | Additional content defined by implementations                                                                         |
| modifierExtension     | 0..\* | Extension       | Extensions that cannot be ignored                                                                                     |
| subject               | 0..\* | Reference       | The medication for which this is an indication                                                                        |
| disease               | 0..1  | CodeableConcept | The disease, symptom or procedure for the contraindication                                                            |
| diseaseStatus         | 0..1  | CodeableConcept | The status of the disease or symptom for the contraindication                                                         |
| comorbidity           | 0..\* | CodeableConcept | A comorbidity (concurrent condition) or coinfection                                                                   |
| therapeuticIndication | 0..\* | Reference       | Information about the use of the medicinal product in relation to other therapies as part of the indication           |
| otherTherapy          | 0..\* | BackboneElement | Information about the use of the medicinal product in relation to other therapies described as part of the indication |
| population            | 0..\* | Population      | The population group to which this applies                                                                            |

## Search Parameters

| Name    | Type      | Description                                          | Expression                               |
| ------- | --------- | ---------------------------------------------------- | ---------------------------------------- |
| subject | reference | The medication for which this is an contraindication | MedicinalProductContraindication.subject |
