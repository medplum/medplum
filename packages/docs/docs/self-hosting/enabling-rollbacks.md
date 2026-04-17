---
sidebar_position: 110
tags:
  - self-hosting
  - upgrades
  - rollbacks
---

# Enabling Rollbacks for Medplum Server

Rolling back a Medplum server deployment is normally not supported, because post-deploy migrations can alter data in ways that are not reversible by simply deploying an older image. However, starting with the `4.x` series, Medplum's minor version cadence gives you a narrow, well-defined window where a rollback is safe — provided you take control of **when** post-deploy migrations run.

This page explains how to enable rollbacks by deferring post-deploy migrations with the `disablePostDeployMigrations` server config setting.

## When Rollbacks Are Safe

Since the `4.x` series, Medplum has structured its release process so that each minor version's post-deploy migrations are the only thing that breaks backward compatibility with the previous minor version's database state. In other words:

- The **pre-deploy** schema changes introduced by a new minor version are additive and tolerated by the previous minor version's code.
- The **post-deploy** migrations introduced by a new minor version are where irreversible data reshaping happens.

This means that if you deploy a new minor version but **do not run its post-deploy migrations**, you can still safely roll back to the latest patch of the **previous** minor version.

:::info The rollback window
You can safely rollback to the **latest patch of the previous minor version** — and only the previous minor — as long as no post-deploy migrations for the new minor version have been applied.
:::

### Example

Suppose your cluster is running `v4.2.6` and you want to upgrade to `v4.3.x`:

```
v4.2.6 (latest patch of previous minor) ─┐
                                         │  ← safe rollback window
v4.3.0 deployed, post-deploy deferred ───┘
```

Once post-deploy migrations for `v4.3.0` have been applied, the rollback window closes. At that point you are fully committed to `v4.3.x` and later.

## How It Works

Medplum server has a config setting called `disablePostDeployMigrations`. When set to `true`, the server starts up and runs pre-deploy migrations normally, but does not automatically enqueue any post-deploy migrations.

| Setting Value     | Behavior                                                                             |
| :---------------- | :----------------------------------------------------------------------------------- |
| `false` (default) | Post-deploy migrations run automatically in the background after server startup.     |
| `true`            | Post-deploy migrations are deferred and must be triggered manually by a Super Admin. |

By keeping `disablePostDeployMigrations` set to `true` during your upgrade, your new-minor-version server instances will be running the new code against a database that is still compatible with the previous minor version. That compatibility is what makes the rollback safe.

## Step-by-Step: Upgrading with Rollback Safety

### 1. Set `disablePostDeployMigrations` to `true`

Before deploying the new minor version, set the following in your server config.

For JSON config:

```json
{
  "disablePostDeployMigrations": true
}
```

For AWS Parameter Store, create or update the parameter:

```
/medplum/{environmentName}/disablePostDeployMigrations
```

with the value `true`.

For environment variables:

```bash
export MEDPLUM_DISABLE_POST_DEPLOY_MIGRATIONS=true
```

See [Setting Medplum Server Configuration](/docs/self-hosting/setting-configuration) for more details on each configuration mechanism.

### 2. Deploy the New Minor Version

Deploy the latest patch of your target minor version (for example, `v4.3.x`) using your standard deployment process — typically `medplum aws update-server` for AWS deployments. See [Upgrading Medplum Server](/docs/self-hosting/upgrading-server) for the full upgrade procedure.

The server will start up, run pre-deploy migrations, and then **stop** without enqueueing any post-deploy migrations.

### 3. Validate the Deployment

While `disablePostDeployMigrations` is `true`, the rollback window is still open. Use this time to:

- Run your smoke tests and integration tests against the new deployment
- Monitor application logs and metrics
- Verify that critical workflows behave as expected

If something goes wrong during this validation phase, you can roll back (see [Performing a Rollback](#performing-a-rollback) below).

### 4. Manually Apply Post-Deploy Migrations

Once you are confident in the new deployment, apply the post-deploy migrations manually. As a Super Admin, navigate to `/admin/super/asyncjob` in the Medplum app, or `POST` to the migration endpoint:

```bash
export AUTH_TOKEN=$(npx medplum token)

curl -X POST \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  https://api.example.com/admin/super/migrate
```

Monitor the resulting `AsyncJob` resource until all pending migrations report a completed status. See [Monitoring Migration Progress](/docs/self-hosting/upgrading-server#monitoring-migration-progress) for details.

:::warning Rollback window closes here
Once post-deploy migrations for the new minor version begin to run, **the rollback window is closed**. You cannot safely roll back after this point.
:::

### 5. Re-enable Automatic Post-Deploy Migrations (Optional)

After you have committed to the new minor version, you may set `disablePostDeployMigrations` back to `false` so that future minor upgrades behave normally. If you plan to use this rollback pattern for every minor upgrade, you can leave it set to `true` permanently and continue applying post-deploy migrations manually after each validation window.

## Performing a Rollback

If validation in Step 3 reveals a problem and you need to roll back:

1. **Confirm no post-deploy migrations have run.** Query `AsyncJob` resources where `type` is `data-migration` and confirm there are no entries corresponding to the new minor version. If any have started — even partially — rollback is no longer safe; contact Medplum support.
2. **Deploy the previous minor version's latest patch.** For example, if you were rolling forward from `v4.2.6` to `v4.3.0` and need to revert, redeploy `v4.2.6` (or whatever is currently the latest patch of `v4.2.x`) using your standard deployment process.
3. **Leave `disablePostDeployMigrations` as is.** The previous minor version will ignore the setting for its own migrations (which have already run) and will start normally against the existing database.
4. **Verify that the rolled-back server is healthy** via your usual health checks and monitoring.

## Best Practices

- **Always pin to a specific patch version** — never use `:latest` — so the version the server actually starts with matches what you intended to deploy. See the [v4.0.0 Upgrade Notice](/blog/v4-upgrade) for a cautionary example.
- **Test the rollback procedure in staging** before you need it in production. A rollback you have never rehearsed is not a rollback plan.
- **Keep the validation window short.** The longer post-deploy migrations are deferred, the more unindexed / unbackfilled data accumulates, and the longer those migrations will take to complete when you do eventually run them.
- **Do not skip minor versions, even with this procedure.** The sequential-minor-version rule described in [Upgrading Medplum Server](/docs/self-hosting/upgrading-server) still applies. This procedure only opens a rollback window for one-minor-version hops; it does not enable skipping minors.

## Troubleshooting

### Post-deploy migrations ran automatically despite the config setting

**Likely cause**: The config value was not picked up by the server at startup — commonly because the AWS Parameter Store parameter was created but the ECS service was not restarted, or an environment variable name was malformed (see the conversion rules in [Setting Medplum Server Configuration](/docs/self-hosting/setting-configuration)).

**Solution**: Confirm the value in use by checking the server's startup logs, which log the loaded config on boot. Redeploy after correcting the setting.

### Rolled-back server refuses to start with a version mismatch

**Likely cause**: A post-deploy migration from the newer version actually did run — often because `disablePostDeployMigrations` was briefly `false`, or a Super Admin triggered the migration endpoint during the validation window.

**Solution**: Roll forward to the newer minor version again and complete the upgrade. The rollback window is closed.

## Need Help?

If you're unsure whether your cluster is in a safe rollback state, or a rollback is not proceeding cleanly:

1. Collect the current server logs, the list of `AsyncJob` resources of type `data-migration`, and the exact versions involved.
2. Review the [changelog](https://github.com/medplum/medplum/releases) for the minor versions involved.
3. Contact Medplum support before taking further action — a partially-applied migration is much easier to recover from than a partially-applied migration compounded by a failed rollback.
