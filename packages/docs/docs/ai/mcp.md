---
sidebar_position: 10
---

# Medplum MCP

Welcome to the official documentation for the Medplum MCP integration. This guide provides an in-depth look at how to set up and use the integration, detailing the available tools and providing practical examples to help you get started.

Medplum is the open-source healthcare developer platform. Our MCP integration allows AI models to securely access, analyze, and interact with healthcare data (e.g., patient records, appointments, lab results) stored on a Medplum server, all powered by the FHIR standard.

### Why FHIR Makes This Powerful

You might expect a healthcare integration to expose dozens of specialized, hand-written tools—one for scheduling, one for lab results, one for medications, and so on. The Medplum MCP takes the opposite approach, and the reason is FHIR.

FHIR is an open, widely-adopted standard, and there is an enormous amount of high-quality FHIR content on the open internet: the official specification, implementation guides, worked examples, community Q&A, and reference code. As a result, modern LLMs are already deeply familiar with FHIR. They understand its resource types, how to construct search queries, how resources reference one another, and how to build valid request bodies—without any Medplum-specific instruction.

This means we don't have to teach the model healthcare. We just have to give it a way to talk to the FHIR server. By exposing a single, general-purpose FHIR request tool (see [`fhir-request`](#fhir-request) below), we let the model bring its existing, extensive knowledge of FHIR to bear on your data. The model already knows _how_ to ask good questions of a FHIR server; the MCP simply lets it ask. That combination—a well-understood standard plus a direct, low-level tool—is what makes the Medplum MCP so capable despite its small surface area.

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

The Medplum MCP integration exposes exactly **three** tools. This small, deliberate surface area is by design—as described [above](#why-fhir-makes-this-powerful), the model already understands FHIR, so it needs only a direct way to talk to the FHIR server rather than a large catalog of narrow, purpose-built tools.

The three tools are:

- [`fhir-request`](#fhir-request) — the primary tool, and the one that does the real work.
- [`search`](#search-and-fetch) and [`fetch`](#search-and-fetch) — lightweight compatibility tools required by some clients.

#### `fhir-request`

- **Title:** Perform a FHIR API Request
- **Description:** This is a powerful, low-level tool that performs a direct FHIR API request. It can be used to create, read, update, or delete FHIR resources, providing full CRUD (Create, Read, Update, Delete) functionality. Because it maps directly onto the FHIR REST API, the model can use its existing FHIR knowledge to drive it—this is the tool behind nearly every interaction.
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
    "path": {
      "type": "string",
      "description": "The FHIR path, relative to the server's FHIR R4 base URL (e.g., 'Patient' or 'Patient?name=Smith'). Do not include a leading slash or the '/fhir/R4' prefix."
    },
    "body": {
      "type": "object",
      "description": "The JSON body of the FHIR resource to be created or updated."
    }
  },
  "required": ["method", "path"]
}
```

#### `search` and `fetch`

- **Description:** These are lightweight, standard tools that some MCP clients (for example, ChatGPT) expect every server to implement in order to connect. They exist primarily for client compatibility—the bulk of real work is done through [`fhir-request`](#fhir-request), which can perform searches and reads directly against the FHIR API.

### Example Use Cases

Here are three examples demonstrating the core capabilities of the Medplum MCP integration. These examples will be visible to users in the Anthropic Directory listing.

**Example 1: Finding High Blood Pressure Patients (Using fhir-request)**

- **Prompt:** "What are the names of all patients who have a blood pressure observation with a systolic value greater than 140 in the last year?"
- **Tool Call:** The AI will use the `fhir-request` tool with the method set to "GET" and a path that queries the `Observation` resource with the appropriate FHIR search parameters (for example, filtering by LOINC code and value), then follows the references back to the associated `Patient` resources.
- **Outcome:** The Medplum server responds with a list of patient names and IDs that match the criteria, which the AI can then summarize for the user.

**Example 2: Scheduling a New Appointment (Using fhir-request)**

- **Prompt:** "Create a new appointment for patient 'Jane Doe' with Dr. Smith for a routine check-up next Tuesday at 10 AM."
- **Tool Call:** The AI will use the `fhir-request` tool with the method set to "POST", the path set to `Appointment`, and a body containing the details of the new appointment.
- **Outcome:** The Medplum server creates the appointment and returns a success message, which the AI can confirm with the user.

**Example 3: Fetching Specific Lab Results (Using fhir-request)**

- **Prompt:** "What were the results of patient 'John Doe's most recent lab work for cholesterol?"
- **Tool Call:** The AI will use the `fhir-request` tool with the method set to "GET"—first querying the `Patient` resource by name to find John Doe's ID, then querying the `Observation` resource filtered by that patient and the relevant cholesterol code, sorted to return the most recent results.
- **Outcome:** The Medplum server returns the detailed observation data, including values and units, which the AI can present to the user in an easy-to-understand format.

### Authentication and Security

Medplum uses **OAuth 2.0 with the 6/18 auth spec** to securely authenticate users. When you first connect the integration, you will be redirected to the Medplum server to log in and authorize Claude.ai to access your data. Medplum's platform ensures all data access is secure and compliant with relevant healthcare regulations. Our full privacy policy can be found here: https://www.medplum.com/privacy

### Support and Community

For questions, feedback, or technical support, please contact us through one of our community channels. We recommend our Discord for real-time conversation and GitHub for bug reports.

- **Discord:** https://discord.gg/medplum
- **Support Email:** support@medplum.com
