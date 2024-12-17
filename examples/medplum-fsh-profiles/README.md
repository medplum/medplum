# Medplum FSH Profiles

This project contains FHIR Shorthand (FSH) definitions for custom FHIR profiles used with Medplum. It currently includes a basic Patient profile that requires a birth date.

## Overview

The project uses [FHIR Shorthand (FSH)](https://build.fhir.org/ig/HL7/fhir-shorthand/) to define custom FHIR profiles. FSH is a domain-specific language for defining FHIR Implementation Guides, profiles, extensions and other FHIR artifacts.

Current profiles:
- `MedplumTestPatient`: Extends the base FHIR Patient resource and requires a birth date

## Prerequisites

- [Node.js](https://nodejs.org/) (v14 or later)
- [SUSHI](https://fshschool.org/docs/sushi/) (installed via npm as a dev dependency)

## Project Structure

``` text

├── src/
│   └── profiles/         # FSH profile definitions
├── dist/                 # Built FHIR artifacts (generated)
├── sushi-config.yaml     # SUSHI configuration
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

``` bash
npm run build:profiles
```


This will process the FSH files in src/profiles and output the generated FHIR resources to the dist directory.

## Configuration

FHIR Version: 4.0.1
Canonical URL: https://medplum.com/profiles/example-fsh-profiles

## Development
To create new profiles:

1. Add new FSH files to the src/profiles directory
2. Run the build command to validate and compile
3. Find the generated FHIR resources in the dist directory
