---
sidebar_position: 10
---

# Medplum MCP

Welcome to the official documentation for the Medplum MCP integration. This guide provides an in-depth look at how to set up and use the integration, detailing the available tools and providing practical examples to help you get started.

Medplum is the open-source healthcare developer platform. Our MCP integration allows AI models to securely access, analyze, and interact with healthcare data (e.g., patient records, appointments, lab results) stored on a Medplum server, all powered by the FHIR standard.

### Getting Started

To begin using the Medplum MCP integration, follow these steps:

1. **Open Claude.ai:** You will need a paid plan to add integrations.
2. **Navigate to Settings:** Click on the settings icon in the bottom left, then navigate to "Organization Integrations."
3. **Add Integration:** Click "Add Integration" and enter the following details:
   - **Integration Name:** Medplum
   - **Integration URL:** https://api.medplum.com/mcp/stream
4. **Connect:** Back on the Organization integrations page, click the "Connect" button. You will be redirected to Medplum to authenticate.
5. **Confirm Access:** Once redirected back to Claude, you can create a new chat and confirm the integration is working by asking: "Can you please confirm you have access to the 'fhir-request' MCP tool?"

_Note: LLMs can sometimes cache sessions. If you experience issues, try disconnecting and reconnecting the integration in a new chat._

### Core Functionality and Tools

The Medplum MCP integration exposes several powerful tools for interacting with FHIR data. Here are the tools available in your MCP server:

#### `search`

- **Title:** FHIR Search
- **Description:** Searches for FHIR resources using standard FHIR search syntax (e.g. `Patient?name=Smith`). This tool is read-only and runs through the caller's authenticated repository context. Results are bounded to keep responses small: `_count` defaults to 20 and is capped at 100, and only matching resources are returned (`_include`/`_revinclude` joins are not executed — read related resources with `fetch`). Use `_count` and `_offset` to page through more results, and `_total=accurate` to include a total match count. Each result contains a FHIR reference (`id`), a human-readable `title`, and the resource's URL on the server (`url`), following the [OpenAI MCP guide](https://developers.openai.com/api/docs/mcp) so the server can be used as a ChatGPT connector. Errors are returned as FHIR `OperationOutcome` payloads so the model can correct its query.
- **Annotations:** Read-only.
- **Schema:**

```json
{
  "type": "object",
  "properties": {
    "query": {
      "type": "string",
      "description": "FHIR search string, e.g. 'Patient?name=Smith&_count=10'."
    }
  },
  "required": ["query"]
}
```

#### `fetch`

- **Title:** FHIR Read
- **Description:** Reads a single FHIR resource by reference (e.g. `Patient/123`), typically obtained from a `search` result. Read-only; runs through the caller's authenticated repository context. Returns the resource as JSON in the `text` field, following the [OpenAI MCP guide](https://developers.openai.com/api/docs/mcp). Very large resources are truncated, and `Binary` resources are not supported. Errors are returned as FHIR `OperationOutcome` payloads.
- **Annotations:** Read-only.
- **Schema:**

```json
{
  "type": "object",
  "properties": {
    "id": {
      "type": "string",
      "description": "The reference of the resource to fetch, obtained from a search result."
    }
  },
  "required": ["id"]
}
```

#### `fhir-request`

- **Title:** Perform a FHIR API Request
- **Description:** This is a powerful, low-level tool that performs a direct FHIR API request. It can be used to create, read, update, or delete FHIR resources, providing full CRUD (Create, Read, Update, Delete) functionality.
- **Annotations:** This tool can modify data.
- **Schema:**

```json
{
  "type": "object",
  "properties": {
    "method": {
      "type": "string",
      "enum": ["GET", "POST", "PUT", "PATCH", "DELETE"],
      "description": "The HTTP method for the request."
    },
    "url": {
      "type": "string",
      "description": "The full FHIR API URL path (e.g., '/fhir/Patient')."
    },
    "body": {
      "type": "object",
      "description": "The JSON body of the FHIR resource to be created or updated."
    }
  },
  "required": ["method", "url"]
}
```

### Example Use Cases

Here are three examples demonstrating the core capabilities of the Medplum MCP integration. These examples will be visible to users in the Anthropic Directory listing.

**Example 1: Finding High Blood Pressure Patients (Using search)**

- **Prompt:** "Which patients have a blood pressure observation with a systolic value greater than 140 in the last year?"
- **Tool Call:** The AI will use the search tool with a FHIR search string such as `Observation?code=85354-9&component-value-quantity=gt140&date=gt2025-07-01`, then look up the referenced patients.
- **Outcome:** The Medplum server responds with a bounded list of matching references and display names, which the AI can then summarize for the user.

**Example 2: Scheduling a New Appointment (Using fhir-request)**

- **Prompt:** "Create a new appointment for patient 'Jane Doe' with Dr. Smith for a routine check-up next Tuesday at 10 AM."
- **Tool Call:** The AI will use the fhir-request tool with the method set to "POST", the url set to /fhir/Appointment, and a body containing the details of the new appointment.
- **Outcome:** The Medplum server creates the appointment and returns a success message, which the AI can confirm with the user.

**Example 3: Fetching Specific Lab Results (Using fetch)**

- **Prompt:** "What were the results of patient 'John Doe's most recent lab work for cholesterol?"
- **Tool Call:** The AI will first use the search tool to find the ID for John Doe, and then the fetch tool to retrieve the specific Observation resources for his latest cholesterol lab work.
- **Outcome:** The Medplum server returns the detailed observation data, including values and units, which the AI can present to the user in an easy-to-understand format.

### Authentication and Security

Medplum uses **OAuth 2.0 with the 6/18 auth spec** to securely authenticate users. When you first connect the integration, you will be redirected to the Medplum server to log in and authorize Claude.ai to access your data. Medplum's platform ensures all data access is secure and compliant with relevant healthcare regulations. Our full privacy policy can be found here: https://www.medplum.com/privacy

### Support and Community

For questions, feedback, or technical support, please contact us through one of our community channels. We recommend our Discord for real-time conversation and GitHub for bug reports.

- **Discord:** https://discord.gg/medplum
- **Support Email:** support@medplum.com
