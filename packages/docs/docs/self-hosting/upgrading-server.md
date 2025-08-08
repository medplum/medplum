---
sidebar_position: 90
---

# Upgrading Medplum Server

Keeping your Medplum server up-to-date ensures you get the latest security patches, new features, and performance improvements while maintaining compliance with healthcare regulations.

## Before You Begin

:::warning Do Not Skip Minor Versions
You cannot skip minor versions when upgrading. Attempting to jump ahead (e.g., from v3.1.2 directly to v4.3.4) will cause your server to fail to start.
:::

**Prerequisites:**
- Review the [versioning policy](../compliance/versions) if you're unfamiliar with Medplum's semantic versioning
- Ensure you have access to [monitor migration progress](#monitoring-migration-progress)

## Step-by-Step Upgrade Process

### 1. Plan Your Upgrade Path

For each minor version between your current version and target version, you must:
- Deploy the latest patch version (Z.Y.X where X is the highest available)
    - Post-deploy migrations will run automatically 
- Wait for all database migrations to complete successfully
- Only then proceed to the next minor version

**Example: Upgrading from v3.1.2 to v4.3.x**

Your upgrade path looks like this:
```
v3.1.2 → v3.3.0 → v4.0.4 → v4.1.12 → v4.2.6 → v4.3.x
```

### 2. Handle Breaking Changes (Major Versions Only)

When crossing major version boundaries (e.g., v3.x.x to v4.x.x):
- **Before deploying**: Update your application code to handle breaking changes
- Review the changelog for your target major version
- Test your application against the new version in a staging environment

### 3. Deploy Each Version

For each step in your upgrade path:

1. **Deploy the version** using your standard deployment process
2. **Monitor startup** - the server will automatically run pre-deploy migrations
3. **Wait for completion** - check that all migrations finish successfully
4. **Verify functionality** - ensure your server is operating normally before proceeding

## Monitoring Migration Progress

### Using the Admin Panel (available after [v4.1.12+](https://github.com/medplum/medplum/pull/6862))
Navigate to `/admin/super/asyncjob` in your Medplum app to view:
- Currently running migrations
- Migration progress and status
- Completion timestamps

### Using the API
Query `AsyncJob` resources where:
- `type` equals `data-migration`
- `dataVersion` indicates the migration number

## Understanding Database Migrations

Medplum uses two types of migrations to minimize downtime:

### Pre-deploy Migrations
- **When they run**: Automatically during server startup
- **Duration**: Complete within seconds
- **Impact**: Server won't start if these fail
- **What they do**: Add columns, create tables, other quick schema changes

### Post-deploy Migrations  
- **When they run**: After server startup (in the background)
- **Duration**: Can take hours or days for large datasets
- **Impact**: Server continues running while these execute
- **What they do**: Add indexes, reindex data, backfill information

## Troubleshooting Common Issues

### Server Won't Start After Upgrade
**Likely cause**: Pre-deploy migration failed

**Solution**: Check server logs for specific error messages and resolve the underlying issue

### Migration Taking Too Long
**Likely cause**: Post-deploy migration running on large dataset

**Solution**: Monitor progress via admin panel; migrations can safely run for extended periods

### Skipped a Minor Version
**Symptoms**: Server refuses to start with version mismatch error

**Solution**: Deploy the missing intermediate versions in order

## Best Practices

- **Test upgrades** in a staging environment first
- **Monitor closely** during the first few hours after each deployment
- **Keep your application code** compatible with the versions you're upgrading through

## Need Help?

If you encounter issues during your upgrade:
1. Check the server logs for specific error messages
2. Review the [changelog](https://github.com/medplum/medplum/releases) for known issues
3. Contact Medplum support with your specific error details and upgrade path
