---
title: TestReport
sidebar_position: 619
---

# TestReport

A summary of information based on the results of executing a TestScript.

## Properties

| Name | Card | Type | Description |
| --- | --- | --- | --- |
| id | 0..1 | string | Logical id of this artifact
| meta | 0..1 | Meta | Metadata about the resource
| implicitRules | 0..1 | uri | A set of rules under which this content was created
| language | 0..1 | code | Language of the resource content
| text | 0..1 | Narrative | Text summary of the resource, for human interpretation
| contained | 0..* | Resource | Contained, inline Resources
| extension | 0..* | Extension | Additional content defined by implementations
| modifierExtension | 0..* | Extension | Extensions that cannot be ignored
| identifier | 0..1 | Identifier | External identifier
| name | 0..1 | string | Informal name of the executed TestScript
| status | 1..1 | code | completed \| in-progress \| waiting \| stopped \| entered-in-error
| testScript | 1..1 | Reference | Reference to the  version-specific TestScript that was executed to produce this TestReport
| result | 1..1 | code | pass \| fail \| pending
| score | 0..1 | decimal | The final score (percentage of tests passed) resulting from the execution of the TestScript
| tester | 0..1 | string | Name of the tester producing this report (Organization or individual)
| issued | 0..1 | dateTime | When the TestScript was executed and this TestReport was generated
| participant | 0..* | BackboneElement | A participant in the test execution, either the execution engine, a client, or a server
| setup | 0..1 | BackboneElement | The results of the series of required setup operations before the tests were executed
| test | 0..* | BackboneElement | A test executed from the test script
| teardown | 0..1 | BackboneElement | The results of running the series of required clean up steps

## Search Parameters

| Name | Type | Description | Expression
| --- | --- | --- | --- |
| identifier | token | An external identifier for the test report | TestReport.identifier
| issued | date | The test report generation date | TestReport.issued
| participant | uri | The reference to a participant in the test execution | TestReport.participant.uri
| result | token | The result disposition of the test execution | TestReport.result
| tester | string | The name of the testing organization | TestReport.tester
| testscript | reference | The test script executed to produce this report | TestReport.testScript

