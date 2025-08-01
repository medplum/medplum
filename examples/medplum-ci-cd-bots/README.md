# Medplum CI/CD Bots Example

This example demonstrates how to create Medplum bots that share code and are automatically deployed with subscriptions. It shows a simple but effective pattern for building reusable bot infrastructure.

## 🎯 Key Features

### 1. Code Sharing Between Bots
- **Shared HTTP Helpers**: Common HTTP request logic used by both sync bots
- **Standardized Error Handling**: Consistent error processing and logging
- **Modular Design**: Bots import and use shared functions to reduce duplication

### 2. Automated Setup Process
- **Single Command Setup**: `npm run setup` handles everything
- **Build & Deploy**: Automatically builds and deploys bots to Medplum
- **Subscription Creation**: Creates subscriptions with correct `Bot/<id>` endpoints
- **TypeScript Support**: Full type safety throughout the setup process

## 📁 Project Structure

```
medplum-ci-cd-bots/
├── src/
│   ├── shared/
│   │   └── http-helpers.ts          # Shared HTTP request functions
│   └── bots/
│       ├── hapi-sync-bot.ts         # Returns enriched resource
│       └── hapi-sync-simple-bot.ts  # Returns boolean result
├── scripts/
│   ├── setup-bots-and-subscriptions.ts  # Complete setup script
│   └── tsconfig.json                    # TypeScript config for scripts
├── package.json
├── medplum.config.json
└── README.md
```

## 🤖 Bots Overview

### HAPI Sync Bot
- **Purpose**: Syncs patient data to external HAPI FHIR server and returns enriched resource
- **Features**: 
  - Adds bidirectional identifiers for tracking
  - Handles External EHR integration (skips sync for External EHR resources)
  - Returns updated Patient resource with HAPI server identifiers
  - Cleans meta information from processed resources
- **Code Reuse**: Uses `makeConditionalFhirRequest()` and `logExternalRequest()` from shared helpers
- **Return Value**: Returns updated Patient resource with HAPI server identifiers

### HAPI Sync Simple Bot
- **Purpose**: Syncs patient data to external HAPI FHIR server (simple version)
- **Features**: 
  - Basic sync functionality without resource enrichment
  - Logs patient name for debugging
  - Handles both create/update and delete operations
- **Code Reuse**: Uses `makeConditionalFhirRequest()` and `logExternalRequest()` from shared helpers
- **Return Value**: Returns boolean indicating sync success/failure

## 🚀 Getting Started

### Prerequisites
- Node.js 20+ 
- Medplum account with API access
- Environment variables configured

### Quick Setup

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

3. **Run Complete Setup**
   ```bash
   npm run setup
   ```
   
   This single command will:
   - Build both bots
   - Deploy bots to Medplum
   - Create subscriptions with correct `Bot/<id>` endpoints

## 📋 Available Scripts

- `npm run setup` - Complete setup (build + deploy + subscribe)
- `npm run build` - Build all bots
- `npm run clean` - Clean build artifacts
- `npm run lint` - Run ESLint
- `npm run test` - Run tests
- `npm run deploy` - Deploy bots to Medplum

## 🔧 Code Sharing Examples

### Shared HTTP Functions
```typescript
// In both bots
import { makeConditionalFhirRequest, HTTP_VERBS, logExternalRequest } from '../shared/http-helpers';

// Make conditional FHIR request
const responseData = await makeConditionalFhirRequest(
  HAPI_SERVER,
  'Patient',
  `https://medplum.com/patient-id|${patient.id}`,
  HTTP_VERBS['PUT'],
  patientForHapi
);

// Log external request result
logExternalRequest('HAPI sync PUT', patient.id, true);
```

### Shared Error Handling
```typescript
// Both bots benefit from standardized error handling
try {
  await makeConditionalFhirRequest(/* ... */);
} catch (error) {
  // All errors are automatically converted to OperationOutcomeError
  // with detailed error information for debugging
  throw error;
}
```

## 📊 Subscription Management

The setup script automatically creates subscriptions for both bots:

```typescript
// Example subscription creation
const subscription = await medplum.createResource({
  resourceType: 'Subscription',
  status: 'active',
  reason: 'CI/CD Bot: hapi-sync-bot',
  criteria: 'Patient?_lastUpdated=gt2023-01-01',
  channel: {
    type: 'rest-hook',
    endpoint: `Bot/${botId}`,  // Correct endpoint format
    payload: 'application/fhir+json',
  },
});
```

## 🧪 Testing

### Manual Testing
1. Create a Patient resource in Medplum
2. Update the Patient resource
3. Check bot execution logs
4. Verify sync results and audit events

### Automated Testing
```bash
npm run test
```

## 🔍 Monitoring

### Bot Execution
- Monitor bot execution in the Medplum console
- Check logs for sync results and error messages
- Review audit trails for compliance

### Subscription Status
- Verify subscriptions are active in Medplum
- Check subscription criteria and endpoints
- Monitor subscription delivery status

## 🛠️ Customization

### Adding New Bots
1. Create bot file in `src/bots/`
2. Add bot configuration to `medplum.config.json`
3. Update subscription creation in `scripts/setup-bots-and-subscriptions.ts`
4. Use shared functions for consistency

### Modifying Shared Functions
1. Update functions in `src/shared/`
2. All bots using those functions will automatically benefit
3. Test changes thoroughly before deployment

### Environment-Specific Configuration
```bash
# Development
export MEDPLUM_BASE_URL="https://dev.medplum.com"

# Production
export MEDPLUM_BASE_URL="https://api.medplum.com"
```

## 📚 Best Practices

### Code Sharing
- Extract common functionality into shared modules
- Use consistent interfaces and error handling
- Document shared functions thoroughly

### Bot Design
- Keep bots focused on single responsibilities
- Use shared functions for consistency
- Implement proper error handling
- Log all important activities

### Subscription Management
- Use descriptive subscription names and reasons
- Implement proper error handling
- Monitor subscription health regularly

## 🔧 Configuration

### External EHR Integration
The `hapi-sync-bot` includes special handling for External EHR integration:

```typescript
// Skip HAPI sync for External EHR authored resources
if (externalEHRClientApplication && patient.meta?.author?.reference === externalEHRClientApplication) {
  console.log('External EHR resource, skipping HAPI sync');
  delete patient.meta;
  return patient;
}
```

### HAPI Server Configuration
Both bots are configured to sync to a HAPI FHIR server:

```typescript
const HAPI_SERVER = 'http://hapi-server:8080';
```

Update this URL to point to your actual HAPI server.

## 🤝 Contributing

1. Follow the existing code structure
2. Use shared functions when possible
3. Add comprehensive documentation
4. Include tests for new functionality

## 📄 License

Apache 2.0 - See LICENSE file for details.

## 🆘 Support

For questions or issues:
- Check the Medplum documentation
- Review bot execution logs
- Contact the Medplum team

---

**Note**: This is an example project demonstrating code sharing patterns with Medplum bots. Adapt the patterns and code to your specific use case. 