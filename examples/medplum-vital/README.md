# Vital Integration

## Overview

This project aims to integrate Vital with Medplum, providing seamless interoperability between the two platforms.
Vital is a powerful tool for managing healthcare data, and by integrating it with Medplum,
we enhance Medplum’s capabilities for handling vital orders, lab results, and other critical health metrics.

## Summary of Changes

1. **Vital Integration**:
   - Added a new bot for interaction with Vital `orders` API.
   - Add a new bot for interaction with Vital `results` API.

## Setup and Configuration

To configure the Vital integration you need to add the following secrets to your Medplum project:

- `VITAL_API_KEY`: The API key for accessing the Vital API.
- `VITAL_BASE_URL`: The base URL for the Vital API.

## Contribution

We welcome contributions to improve this integration. Please follow the standard contribution guidelines:

1. Fork the repository.
2. Create a new branch for your feature or bugfix.
3. Submit a pull request with a detailed description of your changes.
