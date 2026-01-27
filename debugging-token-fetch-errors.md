# Debugging "Failed to fetch tokens" Errors

## Quick Reference - Client IDs

**Affected Clients:**
- **Task Service**: `0195c9e6-aa84-723c-9aa5-6f958dfc9b9b`
- **Messaging Service**: `d67f502b-97af-42bb-b5f0-cdc5ca3ad077`

**Time Windows:**
- 9:00-9:20 AM (45 instances)
- 11:50 AM (10 instances)
- 12:55 PM (3 instances)

## OAuth Logs in Hosted Medplum

**Yes, there are OAuth logs on the Medplum end!**

### Log Location
- **CloudWatch Logs**: Logs are stored in CloudWatch Logs groups
- **Log Group**: `/ecs/medplum/{environment-name}` (e.g., `/ecs/medplum/production`)
- **Log Stream**: `Medplum/{task-id}` (ECS task-specific streams)

### Log Format
Logs are JSON format written to stdout, which ECS forwards to CloudWatch Logs. Each request creates a log entry with:
```json
{
  "level": "info",
  "message": "Request served",
  "durationMs": 123,
  "ip": "1.2.3.4",
  "method": "POST",
  "path": "/oauth2/token",
  "receivedAt": "2026-01-07T09:15:30.123Z",
  "status": 200,
  "ua": "Medplum/1.0.0",
  "requestId": "abc123",
  "traceId": "def456"
}
```

### Enabling Request Logs
Request logging is controlled by the `logRequests` configuration option:
- **Default**: May be disabled depending on environment
- **To enable**: Set `logRequests: true` in the server configuration
- **Note**: Logs all HTTP requests, not just OAuth endpoints

### Querying All oauth2/token Logs

Use **CloudWatch Logs Insights** to query logs. See detailed queries in section "1. Search Application Logs in CloudWatch" below.

## Quick Debugging Checklist

1. ✅ **Application Logs**: Search for `/oauth2/token` requests during time windows
   - Check if requests are reaching the server (if not, infrastructure issue)
   - Check status codes and IP addresses
   - Check request durations

2. ✅ **Database**: Search Login resources with these client references
   - If Login resources exist, requests are reaching the server
   - Extract source IPs from `remoteAddress` field

3. ✅ **Rate Limiting**: Check Redis for rate limit counters
   - Keys format: `ratelimit:{ip}:auth`
   - Default: 60 requests per minute per IP for auth endpoints

4. ✅ **Infrastructure Logs**: Check load balancer/CDN/proxy logs
   - Look for connection resets, timeouts, gateway errors

5. ✅ **Client Applications**: Verify client status and configuration
   - Check if clients are active
   - Check project memberships
   - Check IP access rules in access policies

## Analysis

Based on the codebase investigation, "Failed to fetch tokens" errors occur in the Medplum client (`packages/core/src/client.ts:3769`) when:

1. **The HTTP response is not OK** (`!response.ok`)
2. **AND** the response body cannot be parsed as JSON (typically due to network errors or unexpected response format)

### Error Flow

The error is thrown in `fetchTokens()` method:
- `fetchWithRetry()` attempts the request up to 3 times (with exponential backoff)
- If `response.ok` is false, the code tries to parse the error JSON
- If parsing fails (catch block), it throws `OperationOutcomeError(badRequest('Failed to fetch tokens'), err)`

### Why No Server Logs?

Since there are **no corresponding errors in Medplum server logs**, this indicates:

1. **Requests may not be reaching the server** - Network failures before the request completes
2. **Infrastructure-level blocking** - Load balancers, firewalls, or proxies blocking requests before they reach the application
3. **Client-side network issues** - DNS resolution failures, connection timeouts, or network interruptions

### What Gets Logged Server-Side

The server logs requests via `loggingMiddleware` (in `packages/server/src/app.ts`) only when:
- Requests successfully reach the Express application
- Requests complete (success or error)

**Server-side would log:**
- Rate limit violations (429 status)
- IP access rule violations (400 with "IP address not allowed")
- Authentication failures (400/401 status)
- Other OAuth errors (400 with specific error descriptions)

## Client IDs to Investigate

Based on customer information:
- **Task Service**: `0195c9e6-aa84-723c-9aa5-6f958dfc9b9b`
- **Messaging Service**: `d67f502b-97af-42bb-b5f0-cdc5ca3ad077` (Note: Customer initially provided this as messaging, but later indicated messaging is `dc65943b-ae19-4167-a2ed-a50de6c5bf64`)

## Recommended Debugging Steps

### From Hosted Medplum's End

#### 1. Search Application Logs in CloudWatch

**Log Location:**
- **Log Group**: `/ecs/medplum/{environment-name}` (e.g., `/ecs/medplum/production`, `/ecs/medplum/staging`)
- **Log Format**: JSON logs written to stdout via `console.log()`
- **Note**: Logs are only created if `logRequests: true` is configured

**Log Format:**
```json
{
  "level": "info",
  "message": "Request served",
  "durationMs": 123,
  "ip": "1.2.3.4",
  "method": "POST",
  "path": "/oauth2/token",
  "receivedAt": "2026-01-07T09:15:30.123Z",
  "status": 200,
  "ua": "Medplum/1.0.0",
  "mode": "access",
  "requestId": "abc123",
  "traceId": "def456"
}
```

**CloudWatch Logs Insights Queries:**

**Query 1: All oauth2/token requests during time window**
```sql
fields @timestamp, ip, method, path, status, durationMs, ua
| filter path like /oauth2\/token/ or path like /api\/oauth2\/token/
| filter @timestamp >= "2026-01-07T09:00:00Z" and @timestamp <= "2026-01-07T09:20:00Z"
| sort @timestamp desc
```

**Query 2: Failed oauth2/token requests (non-200 status)**
```sql
fields @timestamp, ip, method, path, status, durationMs, ua
| filter path like /oauth2\/token/ or path like /api\/oauth2\/token/
| filter status >= 400
| filter @timestamp >= "2026-01-07T09:00:00Z" and @timestamp <= "2026-01-07T09:20:00Z"
| sort @timestamp desc
```

**Query 3: Rate limit violations (429 status)**
```sql
fields @timestamp, ip, method, path, status, durationMs, ua
| filter path like /oauth2\/token/ or path like /api\/oauth2\/token/
| filter status = 429
| filter @timestamp >= "2026-01-07T09:00:00Z" and @timestamp <= "2026-01-07T09:20:00Z"
| sort @timestamp desc
```

**Query 4: All oauth2/token requests (no time filter)**
```sql
fields @timestamp, ip, method, path, status, durationMs, ua
| filter path like /oauth2\/token/ or path like /api\/oauth2\/token/
| sort @timestamp desc
| limit 1000
```

**Query 5: OAuth requests grouped by IP and status**
```sql
fields @timestamp, ip, status, durationMs
| filter path like /oauth2\/token/ or path like /api\/oauth2\/token/
| filter @timestamp >= "2026-01-07T09:00:00Z" and @timestamp <= "2026-01-07T09:20:00Z"
| stats count() by ip, status
```

**Query 6: Requests with high duration (possible timeouts)**
```sql
fields @timestamp, ip, method, path, status, durationMs
| filter path like /oauth2\/token/ or path like /api\/oauth2\/token/
| filter durationMs > 5000
| filter @timestamp >= "2026-01-07T09:00:00Z" and @timestamp <= "2026-01-07T09:20:00Z"
| sort durationMs desc
```

**Query 7: Requests by time window (for the three time windows)**
```sql
fields @timestamp, ip, status, durationMs
| filter path like /oauth2\/token/ or path like /api\/oauth2\/token/
| filter 
  (@timestamp >= "2026-01-07T09:00:00Z" and @timestamp <= "2026-01-07T09:20:00Z") or
  (@timestamp >= "2026-01-07T11:50:00Z" and @timestamp <= "2026-01-07T11:51:00Z") or
  (@timestamp >= "2026-01-07T12:55:00Z" and @timestamp <= "2026-01-07T12:56:00Z")
| stats count() by bin(5m)
```

**Accessing CloudWatch Logs:**

1. **AWS Console**:
   - Navigate to CloudWatch → Log groups
   - Find log group: `/ecs/medplum/{environment-name}`
   - Click "Search log group" or "Query with CloudWatch Logs Insights"

2. **AWS CLI**:
   ```bash
   # List log groups
   aws logs describe-log-groups --log-group-name-prefix "/ecs/medplum"
   
   # Query logs using CloudWatch Logs Insights
   aws logs start-query \
     --log-group-name "/ecs/medplum/{environment-name}" \
     --start-time $(date -u -d "2026-01-07 09:00:00" +%s) \
     --end-time $(date -u -d "2026-01-07 09:20:00" +%s) \
     --query-string 'fields @timestamp, ip, method, path, status | filter path like /oauth2\/token/'
   ```

**What to check:**
- **Are there ANY requests to `/oauth2/token` during these time windows?** 
  - If not, requests aren't reaching the server (infrastructure issue)
  - If yes, check the status codes
  
- **Status codes**:
  - `200`: Success (should have corresponding Login resources)
  - `400`: Bad request (invalid client_id, client_secret, or IP access rules)
  - `429`: Rate limit exceeded
  - `408`: Request timeout (client disconnected)
  - `500`: Server error
  
- **IP addresses**: Extract IPs from the logs and check:
  - Rate limiting in Redis
  - IP access rules in access policies
  
- **Duration**: High `durationMs` values suggest:
  - Network timeouts
  - Slow database queries
  - Resource contention

#### 2. Search Database for Login Resources

Search for Login resources created with these client references during the time windows:

**FHIR Search Queries:**
```
GET /fhir/R4/Login?client=ClientApplication/0195c9e6-aa84-723c-9aa5-6f958dfc9b9b&_sort=-_lastUpdated&_lastUpdated=ge2026-01-07T09:00:00Z&_lastUpdated=le2026-01-07T09:20:00Z

GET /fhir/R4/Login?client=ClientApplication/d67f502b-97af-42bb-b5f0-cdc5ca3ad077&_sort=-_lastUpdated&_lastUpdated=ge2026-01-07T09:00:00Z&_lastUpdated=le2026-01-07T09:20:00Z
```

**What to check:**
- Are Login resources being created during these time windows?
- If Login resources are being created, they're reaching the server successfully
- Check `remoteAddress` field for source IPs
- Check `authMethod` field (should be `"client"` for client credentials flow)

#### 3. Check Rate Limiting in Redis

Rate limiting uses Redis keys with format: `ratelimit:{ip}:auth`

**Redis Query:**
```bash
# Check rate limit counters for specific IP addresses
# (You'll need to get IP addresses from step 1 or 2)
redis-cli KEYS "ratelimit:*:auth"

# Check specific rate limit key (replace {ip} with actual IP)
redis-cli GET "ratelimit:{ip}:auth"

# Check TTL for rate limit key
redis-cli TTL "ratelimit:{ip}:auth"
```

**What to check:**
- Are rate limit keys present for the source IPs?
- What are the counter values? (Should be <= 60 per minute for auth endpoints)
- Are any rate limit keys expiring during the time windows?

#### 4. Check Infrastructure Logs

Search infrastructure-level logs (load balancer, CDN, proxy):

**What to look for:**
- Connection resets (`ECONNRESET`)
- Connection timeouts
- 502/503/504 status codes (gateway errors)
- SSL/TLS handshake failures
- DNS resolution failures
- Request timeouts

**Log Query Examples:**
```bash
# Load balancer access logs
path="/oauth2/token" OR path="/api/oauth2/token"
status >= 500 OR status=0 OR error=true
timestamp >= "2026-01-07T09:00:00Z" AND timestamp <= "2026-01-07T09:20:00Z"
```

#### 5. Check IP Access Rules

Review access policies for projects containing these clients:

**FHIR Queries:**
```
GET /fhir/R4/ClientApplication/0195c9e6-aa84-723c-9aa5-6f958dfc9b9b?_include=*&_revinclude=ProjectMembership:profile

GET /fhir/R4/ClientApplication/d67f502b-97af-42bb-b5f0-cdc5ca3ad077?_include=*&_revinclude=ProjectMembership:profile
```

Then check the project's access policies:
```
GET /fhir/R4/AccessPolicy?project={projectId}
```

**What to check:**
- Do access policies have `ipAccessRule` entries?
- Are there any `block` rules that might match the source IPs?
- Would IP blocks return 400 status (which should be logged)?

#### 6. Check Client Application Status

Verify the client applications are active:

**FHIR Queries:**
```
GET /fhir/R4/ClientApplication/0195c9e6-aa84-723c-9aa5-6f958dfc9b9b

GET /fhir/R4/ClientApplication/d67f502b-97af-42bb-b5f0-cdc5ca3ad077
```

**What to check:**
- Is `status` field set to `"active"`? (Non-active status would return 400)
- Are the client secrets correct? (Invalid secrets would return 400)
- Do the clients have valid project memberships?

#### 7. Monitor for Patterns

Check if errors correlate with:
- Infrastructure deployments during those time windows
- DNS changes or DNS propagation issues
- Network maintenance
- Rate limit resets
- Database connection pool exhaustion
- Redis connection issues

### Information to Request from Customer

1. **Client Details**:
   - Which client IDs are experiencing issues?
   - Are these client credentials flows or refresh token flows?
   - Are errors happening during initial login or token refresh?

2. **User/Request Context**:
   - Which specific users/clients are affected?
   - What operations were they trying to perform?
   - Is this affecting all users or a subset?

3. **Network Context**:
   - Source IP addresses of the failing requests
   - Are requests coming from a single server/IP or multiple?
   - Network environment (AWS, GCP, on-premises, etc.)
   - Any proxies, load balancers, or firewalls between client and Medplum?

4. **Error Details**:
   - Full error messages (the catch block may contain the underlying error)
   - Request/response timing information
   - Whether requests are timing out or failing immediately
   - Client-side logs showing network-level errors

5. **Timing Patterns**:
   - Do errors correlate with specific actions?
   - Are there patterns (all at once, gradually increasing, etc.)?
   - Compare with normal traffic patterns

6. **Client Configuration**:
   - How is the MedplumClient configured?
   - What is the `baseUrl` configuration?
   - Are there any custom retry settings?

## Most Likely Root Causes

Given that there are no server logs:

1. **Network Connectivity Issues** (most likely)
   - Temporary network interruptions
   - Connection timeouts
   - DNS resolution failures
   - Load balancer health check failures

2. **Rate Limiting** (if requests do reach infrastructure)
   - Multiple simultaneous requests from same IP
   - Burst traffic exceeding 1 req/sec limit

3. **Infrastructure-Level Blocking**
   - Firewall rules blocking specific IPs
   - WAF rules triggering false positives
   - Load balancer connection limits

4. **Client-Side Issues**
   - Network configuration problems
   - Proxy issues
   - DNS caching problems

## Specific Search Queries for These Client IDs

### Application Log Search

**Time Window: 9:00-9:20 AM (and other windows)**
```json
{
  "query": {
    "bool": {
      "must": [
        {
          "bool": {
            "should": [
              { "match": { "path": "/oauth2/token" }},
              { "match": { "path": "/api/oauth2/token" }}
            ]
          }
        },
        { "match": { "method": "POST" }},
        {
          "range": {
            "receivedAt": {
              "gte": "2026-01-07T09:00:00Z",
              "lte": "2026-01-07T09:20:00Z"
            }
          }
        }
      ]
    }
  }
}
```

### Database Search for Login Resources

**Task Service Client:**
```
GET /fhir/R4/Login?client=ClientApplication%2F0195c9e6-aa84-723c-9aa5-6f958dfc9b9b&authMethod=client&_sort=-_lastUpdated&_lastUpdated=ge2026-01-07T09:00:00Z&_lastUpdated=le2026-01-07T09:20:00Z
```

**Messaging Service Client (if applicable):**
```
GET /fhir/R4/Login?client=ClientApplication%2Fd67f502b-97af-42bb-b5f0-cdc5ca3ad077&authMethod=client&_sort=-_lastUpdated&_lastUpdated=ge2026-01-07T09:00:00Z&_lastUpdated=le2026-01-07T09:20:00Z
```

### Check Client Application Details

**Task Service:**
```
GET /fhir/R4/ClientApplication/0195c9e6-aa84-723c-9aa5-6f958dfc9b9b?_include=*&_revinclude=ProjectMembership:profile
```

**Messaging Service:**
```
GET /fhir/R4/ClientApplication/d67f502b-97af-42bb-b5f0-cdc5ca3ad077?_include=*&_revinclude=ProjectMembership:profile
```

## Recommended Response to Customer

> We've identified the client IDs:
> - Task Service: `0195c9e6-aa84-723c-9aa5-6f958dfc9b9b`
> - Messaging Service: `d67f502b-97af-42bb-b5f0-cdc5ca3ad077`
>
> Based on our investigation, "Failed to fetch tokens" errors occur when requests to the `/oauth2/token` endpoint fail at the network level or return non-200 responses that cannot be parsed.
>
> Since we don't see any corresponding errors in Medplum's application logs, this suggests the requests may not be reaching our application servers, or they're failing at the infrastructure level.
>
> **From our end, we'll check:**
> - Application logs for `/oauth2/token` requests during 9:00-9:20 AM, 11:50 AM, and 12:55 PM
> - Login resources created with these client references during those time windows
> - Rate limiting in Redis for the source IP addresses
> - Infrastructure logs (load balancer, CDN, etc.) for connection errors
> - IP access rules in access policies for these clients' projects
> - Client application status and configuration
>
> **Additional information that would help:**
> 1. **Source IPs** - Can you provide the IP addresses making these requests?
> 2. **Flow type** - Is this happening during initial client credentials login, refresh token flows, or both?
> 3. **Error details** - Do you have full error stack traces showing the underlying network error?
> 4. **Timing** - Are errors happening immediately or after timeouts?
> 5. **Retry behavior** - How many retries are being attempted? (The client retries up to 3 times by default)

## Code References

- Error thrown: `packages/core/src/client.ts:3769`
- Token fetching: `packages/core/src/client.ts:3742-3775`
- Retry logic: `packages/core/src/client.ts:3154-3195`
- Server token handler: `packages/server/src/oauth/token.ts:52-80`
- Rate limiting: `packages/server/src/ratelimit.ts`
- IP access rules: `packages/server/src/oauth/utils.ts:441-455`

