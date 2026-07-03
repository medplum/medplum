# CQL Tests

These were extracted from https://github.com/inferno-framework/davinci-dtr-test-kit

Specifically from `lib/davinci_dtr_test_kit/fixtures/respiratory_assist_device/questionnaire_package.json`

DTR Test Kit is a Ruby-based test kit for the Da Vinci Respiratory Assist Device Implementation Guide.

For DTR STU2 / v2.0.1, ELM is required in payer-provided Libraries when CQL is packaged in `Library` resources.

The vendored DTR requirements in this repo say:

- Raw CQL in Libraries SHALL be provided as a separate `Library.content` repetition.
- Compiled ELM JSON, `application/elm+json`, SHALL also be provided as a separate `Library.content` repetition.
- Both CQL and ELM are sent using `content.data`.

See `lib/davinci_dtr_test_kit/requirements/davinci_dtr_test_kit_requirements.csv:99`.

`text/cql` is not just documentation, and `application/elm+json` is not optional convenience for DTR 2.0.1 payer responses. If a payer packages CQL in FHIR `Library` resources, the DTR IG expects both the raw CQL and compiled JSON ELM.
