# Medplum CI/CD Bots - HAPI FHIR Server Integration

This example demonstrates how to create a comprehensive CI/CD (Continuous Integration/Continuous Deployment) system using Medplum bots for HAPI FHIR server synchronization, showcasing code reuse patterns and automated deployment workflows.

## 🎯 Key Features

### 1. CI/CD Pipeline
- **Automated Build Process**: TypeScript compilation, linting, and bundling
- **Automated Deployment**: One-command bot deployment and subscription management
- **Environment Management**: Support for dev, staging, and production environments
- **Version Control Integration**: Automated deployment from code changes

### 2. HAPI FHIR Server Integration
- **Bidirectional Sync**: Synchronizes patient data between Medplum and HAPI FHIR servers
- **Identifier Management**: Automatically adds and manages cross-system identifiers
- **Conditional Operations**: Uses FHIR conditional operations for efficient updates
- **Error Handling**: Comprehensive error handling with standardized OperationOutcome responses

### 3. Code Reuse & Modularity
- **Shared HTTP Helpers**: Common HTTP functionality for external API communication
- **Standardized Error Handling**: Consistent error processing across all bots
- **Modular Design**: Bots import and use shared functions to reduce duplication
- **Reusable Components**: Easy to extend and add new sync integrations

## 📁 Project Structure

```
medplum-ci-cd-bots/
├── src/
│   ├── shared/
│   │   └── http-helpers.ts         # Shared HTTP functions for external APIs
│   └── bots/
│       ├── hapi-sync-bot.ts        # Full-featured HAPI sync bot
│       └── hapi-sync-simple-bot.ts # Simplified HAPI sync bot
├── scripts/
│   └── setup-bots-and-subscriptions.ts  # Automated deployment script
├── package.json
├── medplum.config.json
├── tsconfig.json
├── esbuild-script.mjs
└── README.md
```

## 🤖 CI/CD Bot Components

### HAPI Sync Bot (Full-Featured)
- **Purpose**: HAPI FHIR server synchronization with bidirectional identifier management
- **CI/CD Features**: 
  - Automated deployment with version tracking
  - Environment-specific configuration
  - Comprehensive error handling and logging
  - Integration with CI/CD pipeline
- **Sync Features**: 
  - Adds Medplum identifiers to patient records for tracking
  - Enriches patient data with HAPI server identifiers
  - Handles both creation/updates and deletions
  - Skips processing for External EHR authored resources
  - Returns updated patient with cross-system identifiers
- **Code Reuse**: Uses `makeConditionalFhirRequest()` and `logExternalRequest()` from shared helpers

### HAPI Sync Simple Bot
- **Purpose**: Simplified HAPI FHIR server synchronization for development and testing
- **CI/CD Features**:
  - Lightweight deployment for rapid iteration
  - Simplified error handling for debugging
  - Quick deployment for testing scenarios
- **Sync Features**:
  - Basic patient sync without modifying the input resource
  - Adds Medplum identifiers for tracking
  - Returns boolean success/failure status
  - Handles both creation/updates and deletions
- **Code Reuse**: Uses `makeConditionalFhirRequest()` and `logExternalRequest()` from shared helpers

## 🚀 CI/CD Pipeline Setup

### Prerequisites
- Node.js 20+ 
- Medplum account with API access
- HAPI FHIR server instance (or modify the server URL in bot code)
- Environment variables configured
- Git repository for version control

### Installation

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Configure Environment Variables**
   ```bash
   export MEDPLUM_CLIENT_ID="your-client-id"
   export MEDPLUM_CLIENT_SECRET="your-client-secret"
   export MEDPLUM_BASE_URL="https://api.medplum.com"  # Optional
   ```

3. **Configure HAPI Server URL**
   
   Update the `HAPI_SERVER` constant in both bot files:
   ```typescript
   // In src/bots/hapi-sync-bot.ts and src/bots/hapi-sync-simple-bot.ts
   const HAPI_SERVER = 'http://your-hapi-server:8080';
   ```

4. **Deploy via CI/CD Pipeline**
   ```bash
   npm run setup:bots
   ```
   
   This single command handles the complete CI/CD pipeline:
   - Builds all bots with TypeScript compilation
   - Runs linting and quality checks
   - Deploys bots to Medplum
   - Creates and configures subscriptions

## 📋 CI/CD Pipeline Scripts

- `npm run build` - Complete build pipeline (TypeScript compilation + bundling + linting)
- `npm run clean` - Clean build artifacts
- `npm run lint` - Run ESLint quality checks
- `npm run test` - Run automated tests
- `npm run setup:bots` - Complete CI/CD pipeline (build + deploy + subscriptions)
- `npm run deploy:bots` - Deploy bots only (skip subscription creation)

## 🔧 Code Reuse Examples

### Shared HTTP Functions
```typescript
// In any bot
import { makeConditionalFhirRequest, HTTP_VERBS, logExternalRequest } from '../shared/http-helpers';

// Make conditional FHIR request
const response = await makeConditionalFhirRequest(
  serverUrl,
  'Patient',
  'identifier=https://medplum.com/patient-id|123',
  HTTP_VERBS.PUT,
  patientData
);

// Log external request
logExternalRequest('HAPI sync PUT', patientId, true);
```

### Error Handling
```typescript
// Standardized error handling with OperationOutcome
try {
  await makeConditionalFhirRequest(/* ... */);
} catch (error) {
  // Errors are automatically converted to OperationOutcome format
  logExternalRequest('HAPI sync PUT', patientId, false, error.message);
  throw error; // Re-throw as OperationOutcomeError
}
```

## 📊 CI/CD Subscription Management

The automated setup script creates and manages subscriptions for all bots:

```typescript
// Example subscription creation for HAPI sync bot
const subscription = await medplum.createResource({
  resourceType: 'Subscription',
  status: 'active',
  reason: 'CI/CD Bot: hapi-sync-bot',
  criteria: 'Patient?_lastUpdated=gt2023-01-01',
  channel: {
    type: 'rest-hook',
    endpoint: 'https://api.medplum.com/bots/hapi-sync-bot',
    payload: 'application/fhir+json',
  },
});
```

## 🧪 CI/CD Testing & Validation

### Automated Testing
```bash
npm run test
```

### Manual Testing (Post-Deployment)
1. Create a Patient resource in Medplum
2. Update the Patient resource
3. Check bot execution logs in Medplum dashboard
4. Verify patient data appears in HAPI FHIR server
5. Check for cross-system identifiers in both systems
6. Validate CI/CD pipeline deployment success

## 🔍 CI/CD Monitoring & Observability

### Pipeline Monitoring
- Monitor CI/CD pipeline execution and deployment status
- Track bot deployment versions and rollback capabilities
- Monitor subscription creation and configuration status

### Bot Execution Monitoring
- Monitor bot execution in the Medplum dashboard
- Check logs for sync operations and error messages
- Review external request logs for API communication
- Track deployment success rates and error patterns

### HAPI Server Integration Monitoring
- Verify patient records appear in HAPI FHIR server
- Check for Medplum identifiers in HAPI patient records
- Monitor for HAPI server identifiers in Medplum patient records
- Verify subscription delivery status
- Monitor sync performance and data consistency

## 🛠️ CI/CD Customization

### Adding New Sync Bots to Pipeline
1. Create bot file in `src/bots/`
2. Import shared HTTP helpers
3. Add bot configuration to `medplum.config.json`
4. Update deployment script if needed
5. Use consistent error handling patterns
6. Add to CI/CD pipeline automation

### Modifying HAPI Server Configuration
```typescript
// Update server URL and authentication
const HAPI_SERVER = 'https://your-hapi-server.com/fhir';
const HAPI_AUTH_HEADERS = {
  'Authorization': 'Bearer your-token'
};
```

### Environment-Specific CI/CD Configuration
```bash
# Development Environment
export MEDPLUM_BASE_URL="https://dev.medplum.com"
export NODE_ENV="development"
# Update HAPI_SERVER to point to dev HAPI instance

# Staging Environment
export MEDPLUM_BASE_URL="https://staging.medplum.com"
export NODE_ENV="staging"
# Update HAPI_SERVER to point to staging HAPI instance

# Production Environment
export MEDPLUM_BASE_URL="https://api.medplum.com"
export NODE_ENV="production"
# Update HAPI_SERVER to point to prod HAPI instance
```

## 📚 CI/CD Best Practices

### Pipeline Management
- Use automated testing before deployment
- Implement proper version control and tagging
- Use environment-specific configurations
- Monitor deployment success rates and rollback capabilities

### FHIR Integration
- Use conditional operations for efficient updates
- Implement proper identifier management
- Handle both creation/updates and deletions
- Use standardized error responses (OperationOutcome)

### Code Reuse & Modularity
- Extract common HTTP functionality into shared modules
- Use consistent error handling patterns
- Implement comprehensive logging
- Document shared functions thoroughly
- Design for easy extension and maintenance

### Bot Design
- Keep bots focused on single responsibilities
- Use shared functions for consistency
- Implement proper error handling and logging
- Return appropriate FHIR resources or status
- Design for CI/CD pipeline integration

## 🤝 Contributing to CI/CD Pipeline

1. Follow the existing code structure and CI/CD patterns
2. Use shared HTTP helpers for external API calls
3. Add comprehensive documentation and testing
4. Include automated tests for new functionality
5. Follow FHIR best practices and CI/CD standards
6. Ensure pipeline compatibility and deployment readiness

## 📄 License

Apache 2.0 - See LICENSE file for details.

## 🆘 Support

For questions or issues:
- Check the Medplum documentation
- Review bot execution logs
- Contact the Medplum team

---

**Note**: This example demonstrates comprehensive CI/CD patterns for HAPI FHIR server integration with Medplum bots. The pipeline includes automated building, testing, deployment, and monitoring. Adapt the CI/CD patterns and HAPI integration code to your specific requirements and infrastructure. 
