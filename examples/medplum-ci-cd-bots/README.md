# Medplum CI/CD Bots Example

This example demonstrates how to create a comprehensive CI/CD (Continuous Integration/Continuous Deployment) system using Medplum bots with code reuse and automated subscription management.

## 🎯 Key Features

### 1. Code Reuse
- **Shared Validation Helpers**: Common validation logic used across multiple bots
- **Shared Audit Helpers**: Consistent logging and audit event creation
- **Modular Design**: Bots import and use shared functions to reduce duplication

### 2. Automated Subscription Management
- **Install Script**: Automatically creates subscriptions for all bots
- **Environment Configuration**: Supports different environments (dev, staging, prod)
- **Error Handling**: Comprehensive error reporting and rollback capabilities

## 📁 Project Structure

```
medplum-ci-cd-bots/
├── src/
│   ├── shared/
│   │   ├── validation-helpers.ts    # Shared validation functions
│   │   └── audit-helpers.ts         # Shared audit and logging functions
│   └── bots/
│       ├── patient-validation-bot.ts
│       ├── patient-audit-bot.ts
│       ├── patient-notification-bot.ts
│       ├── resource-sync-bot.ts
│       └── data-quality-bot.ts
├── scripts/
│   └── install-subscriptions.mjs    # Subscription installation script
├── package.json
├── medplum.config.json
└── README.md
```

## 🤖 Bots Overview

### Patient Validation Bot
- **Purpose**: Validates patient data using shared validation functions
- **Features**: Comprehensive validation of demographics, identifiers, and addresses
- **Code Reuse**: Uses `validatePatientComprehensive()` from shared helpers

### Patient Audit Bot
- **Purpose**: Creates audit events for patient changes
- **Features**: Standardized audit event creation and logging
- **Code Reuse**: Uses `createPatientAuditEvent()` and `logPatientChange()` from shared helpers

### Patient Notification Bot
- **Purpose**: Sends notifications about patient changes
- **Features**: Multi-channel notifications (email, SMS, Slack)
- **Code Reuse**: Uses `logPatientChange()` and `logMessage()` from shared helpers

### Resource Sync Bot
- **Purpose**: Syncs patient data to external systems
- **Features**: Validates data before syncing, supports multiple external systems
- **Code Reuse**: Uses validation and logging functions from shared helpers

### Data Quality Bot
- **Purpose**: Performs comprehensive data quality analysis
- **Features**: Quality scoring, detailed reports, threshold monitoring
- **Code Reuse**: Uses multiple shared validation and logging functions

## 🚀 Getting Started

### Prerequisites
- Node.js 20+ 
- Medplum account with API access
- Environment variables configured

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

3. **Create Subscriptions**
   ```bash
   npm run install:subscriptions
   ```

4. **Build and Deploy Bots**
   ```bash
   npm run build
   npm run deploy
   ```

## 📋 Available Scripts

- `npm run build` - Build all bots
- `npm run clean` - Clean build artifacts
- `npm run lint` - Run ESLint
- `npm run test` - Run tests
- `npm run install:subscriptions` - Create subscriptions for all bots
- `npm run deploy` - Deploy bots to Medplum

## 🔧 Code Reuse Examples

### Shared Validation Functions
```typescript
// In any bot
import { validatePatientComprehensive } from '../shared/validation-helpers';

const validationResult = validatePatientComprehensive(patient);
if (!validationResult.isValid) {
  // Handle validation errors
}
```

### Shared Audit Functions
```typescript
// In any bot
import { logPatientChange, createPatientAuditEvent } from '../shared/audit-helpers';

logPatientChange(patient, 'update', 'Patient updated via bot');
const auditEvent = createPatientAuditEvent(patient, 'update');
```

## 📊 Subscription Management

The install script automatically creates subscriptions for all bots:

```javascript
// Example subscription creation
const subscription = await medplum.createResource({
  resourceType: 'Subscription',
  status: 'active',
  reason: 'CI/CD Bot: patient-validation-bot',
  criteria: 'Patient?_lastUpdated=gt2023-01-01',
  channel: {
    type: 'rest-hook',
    endpoint: 'https://api.medplum.com/bots/patient-validation-bot',
    payload: 'application/fhir+json',
  },
});
```

## 🧪 Testing

### Manual Testing
1. Create a Patient resource in Medplum
2. Update the Patient resource
3. Check bot execution logs
4. Verify audit events and notifications

### Automated Testing
```bash
npm run test
```

## 🔍 Monitoring

### Bot Execution
- Monitor bot execution in the Medplum dashboard
- Check logs for validation results, audit events, and notifications
- Review quality reports for data quality metrics

### Subscription Status
- Verify subscriptions are active in Medplum
- Check subscription criteria and endpoints
- Monitor subscription delivery status

## 🛠️ Customization

### Adding New Bots
1. Create bot file in `src/bots/`
2. Add bot configuration to `medplum.config.json`
3. Update subscription creation in `scripts/install-subscriptions.mjs`
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

### Code Reuse
- Extract common functionality into shared modules
- Use consistent interfaces and error handling
- Document shared functions thoroughly

### Subscription Management
- Use descriptive subscription names and reasons
- Implement proper error handling and rollback
- Monitor subscription health regularly

### Bot Design
- Keep bots focused on single responsibilities
- Use shared functions for consistency
- Implement proper error handling
- Log all important activities

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

**Note**: This is an example project demonstrating CI/CD patterns with Medplum bots. Adapt the patterns and code to your specific use case. 