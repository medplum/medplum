# Medplum FSH Profiles

This project contains FHIR Shorthand (FSH) definitions for custom FHIR profiles used with Medplum. It includes `Patient` and `HealthcareService` profiles with custom vocabularies.

## Overview

The project uses [FHIR Shorthand (FSH)](https://build.fhir.org/ig/HL7/fhir-shorthand/) to define custom FHIR profiles. FSH is a domain-specific language for defining FHIR Implementation Guides, profiles, extensions and other FHIR artifacts.

Current profiles:
- `MedplumTestPatient`: Extends the base FHIR Patient resource and requires a birth date
- `ServiceManagementHealthcareService`: Extends HealthcareService with custom service types and categories

### Code Systems and Value Sets

The project includes custom vocabularies for healthcare service classification:

- `ServiceTypes`: Defines service domains (task management, order management, etc.)
- `ServiceCategories`: Defines specific service categories (lab orders, imaging orders, etc.)
- Corresponding value sets that reference these code systems

## Prerequisites

- [Node.js](https://nodejs.org/) (v14 or later)
- [SUSHI](https://fshschool.org/docs/sushi/) (installed via npm as a dev dependency)

## Project Structure

```text
├── src/
│   └── profiles/                   # FSH profile definitions
│       ├── patient-test.fsh        # Patient profile
│       └── health-care-service.fsh # HealthcareService profile and vocabularies
├── dist/                           # Built FHIR artifacts (generated)
├── sushi-config.yaml               # SUSHI configuration
└── package.json
```

## Installation

1. Clone this repository
2. Install dependencies:
```bash
npm install
```

## Usage

To build the FSH profiles into FHIR JSON resources:
```bash
npm run build:profiles
```

This will process the FSH files in src/profiles and output the generated FHIR resources to the dist directory.

## Configuration

- FHIR Version: 4.0.1
- Canonical URL: https://medplum.com/profiles/example-fsh-profiles

## Development

To create new profiles:
1. Add new FSH files to the src/profiles directory
2. Run the build command to validate and compile
3. Find the generated FHIR resources in the dist directory

### Healthcare Service Profile

The `ServiceManagementHealthcareService` profile enables consistent categorization of healthcare services by:
- Requiring exactly one service type and category
- Using custom value sets through required bindings
- Marking these fields as must-support (MS)

Example use cases include:
- Organizing clinical task management services
- Categorizing order management systems
- Structuring scheduling and referral services
