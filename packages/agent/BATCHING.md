# HL7 Durable Queue Batching

## Overview

The HL7 agent now uses **batched writes** to the SQLite durable queue to improve performance at high message volumes. Instead of inserting each message individually, messages are buffered in memory and written to the database in batches using a single transaction.

## How It Works

1. **In-Memory Buffer**: Incoming HL7 messages are added to an in-memory buffer
2. **Periodic Flush**: Every N milliseconds, the buffer is flushed to SQLite in a single transaction
3. **Size-Based Flush**: If the buffer reaches max size, it's flushed immediately
4. **Worker Trigger**: When a batch is flushed, the WebSocket worker is triggered to process messages

## Performance Benefits

- **Batched INSERTs**: Single transaction instead of N individual INSERTs for incoming messages
- **Batched UPDATEs**: Single UPDATE statement instead of N individual UPDATEs for status changes
- **Better Event Loop Performance**: Less blocking on I/O operations
- **Higher Throughput**: Can handle 1000+ messages/second without CPU depletion
- **Transaction Safety**: All messages in a batch are inserted atomically
- **Parallel WebSocket Sends**: All queued messages are sent to the server without blocking waits

### Batch Operations

The following operations use batching for improved performance:

- **Message insertion**: Incoming HL7 messages are buffered and inserted in batches using multi-value INSERT
- **Status updates**: Messages are updated in batches using transactions with prepared statements:
  - `markAsSentBatch()` - Mark messages as sent to server
  - `markAsErrorBatch()` - Mark messages as errored

**Implementation Details:**
- All SQL statements are prepared **once** during queue initialization
- Batch operations use transactions with the pre-prepared statements
- Single UPDATE executed N times within a transaction (atomic commit)
- Batch operations automatically fall back to single statement when batch size is 1

## Default Configuration

```typescript
{
  enabled: true,          // Batching enabled by default
  maxBatchSize: 100,      // Flush when buffer reaches 100 messages
  flushIntervalMs: 100    // Flush every 100ms
}
```

## Agent Settings Configuration

You can customize batching via Agent resource settings:

```json
{
  "resourceType": "Agent",
  "id": "your-agent-id",
  "setting": [
    {
      "name": "batchEnabled",
      "valueBoolean": true
    },
    {
      "name": "batchSize",
      "valueInteger": 200
    },
    {
      "name": "batchFlushMs",
      "valueInteger": 50
    }
  ]
}
```

### Settings

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `batchEnabled` | boolean | `true` | Enable/disable batching |
| `batchSize` | integer | `100` | Max messages to buffer before forcing a flush |
| `batchFlushMs` | integer | `100` | Flush interval in milliseconds |

## Tuning Guidelines

### High Volume (1000+ msg/sec)
```json
{
  "name": "batchSize",
  "valueInteger": 500
},
{
  "name": "batchFlushMs",
  "valueInteger": 50
}
```
Larger batches, faster flush → maximum throughput

### Low Latency (priority on response time)
```json
{
  "name": "batchSize",
  "valueInteger": 10
},
{
  "name": "batchFlushMs",
  "valueInteger": 10
}
```
Smaller batches, very fast flush → minimal delay

### Moderate Load (100-500 msg/sec)
Use defaults - they work well for most scenarios

### Disable Batching
```json
{
  "name": "batchEnabled",
  "valueBoolean": false
}
```
Messages are written immediately (original behavior)

## Implementation Details

### Queue States

Messages go through these states in the durable queue:

1. **Buffered** (in-memory): Message added to `pendingMessages[]`
2. **Flushed**: Batch written to SQLite with status `'received'`
3. **Sent**: WebSocket worker picks up and sends to server, status → `'sent'`
4. **Response Queued**: Server response received, status → `'response_queued'`
5. **Response Sent**: ACK sent back to HL7 client, status → `'response_sent'`

### Flush Triggers

A batch flush occurs when:
- **Timer fires**: Every `flushIntervalMs` milliseconds
- **Buffer full**: Buffer reaches `maxBatchSize` messages
- **Shutdown**: Agent stops (ensures no messages are lost)

### Atomicity

All messages in a batch are inserted in a single SQLite transaction:

```typescript
const transaction = this.db.transaction(() => {
  for (const pending of messagesToFlush) {
    this.insertMessageStmt.run(/* ... */);
  }
});
transaction(); // Atomic commit
```

## Monitoring

The durable queue stats show queue depth by status:

```json
{
  "durableQueueReceived": 15,     // Messages waiting to be sent
  "durableQueueSent": 42,          // Messages sent, waiting for ACK
  "durableQueueResponseQueued": 3  // ACKs waiting to be delivered
}
```

Watch for:
- **High `durableQueueReceived`**: Messages arriving faster than they're being processed
- **High `durableQueueSent`**: Server is slow to respond with ACKs
- **Growing totals**: Possible bottleneck or stuck worker

## Testing

Use the async load test script to validate batching performance:

```bash
# High volume test
npx tsx send-hl7-async-load-test.ts --rate 1000 --count 10000

# Sustained load
npx tsx send-hl7-async-load-test.ts --rate 500 --duration 120

# Monitor stats in agent logs every 5 seconds
```

## Backwards Compatibility

- **Default behavior**: Batching is enabled with conservative defaults
- **Opt-out available**: Set `batchEnabled: false` to disable
- **No breaking changes**: Existing agents continue to work without configuration changes

## Troubleshooting

### Messages delayed?
- Check `batchFlushMs` - reduce for lower latency
- Verify worker is running (check logs for "WebSocket worker error")

### High CPU usage?
- Increase `batchFlushMs` to reduce flush frequency
- Increase `batchSize` to write larger batches

### Messages lost on crash?
- Buffered messages (not yet flushed) are lost on hard crash
- Reduce `batchFlushMs` and `batchSize` for more durability
- Consider disabling batching for critical low-volume scenarios
