---
sidebar_position: 21
---

# ASTM Channels

Clinical analyzers — Bio-Rad, Beckman, Roche, and many others — commonly speak **ASTM E1381** (the
link layer) carrying **ASTM E1394** (the record format) over a TCP socket. The Agent handles these
with a [byte stream channel](./features.md), configured entirely through query parameters on the
channel's `Endpoint.address`.

This page covers the configuration those analyzers need, and the behaviors that most often surprise
people integrating one for the first time.

## Recommended configuration

```
tcp://0.0.0.0:9004
  ?startChar=%05&endChar=%04
  &autoRespond=%05:%06,%03:%06,%17:%06
  &stripControlChars=true&keepControlChars=%0D%0A
  &bodyEncoding=utf-8
  &ignoreResponse=true
```

(Shown wrapped for readability; the real value is a single line.)

| Parameter                             | Why an ASTM channel needs it                                                                                                                       |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `startChar=%05&endChar=%04`           | Frames on `ENQ`/`EOT`, so one **ASTM session** becomes one message. See [Framing](#framing-one-session-per-message).                               |
| `autoRespond=%05:%06,%03:%06,%17:%06` | Answers `ENQ`, `ETX`, and `ETB` with `ACK`, which is the full set of bytes E1381 acknowledges. See [Acknowledgement](#link-level-acknowledgement). |
| `stripControlChars=true`              | Removes the `ENQ`, `STX`, `ETX`/`ETB` and `EOT` framing, leaving readable records.                                                                 |
| `keepControlChars=%0D%0A`             | Exempts `CR` and `LF` from that sweep. ASTM records are `CR`-terminated; without this the whole message is one run-on line.                        |
| `bodyEncoding=utf-8`                  | Delivers the body to the Bot as text. The default, `hex`, would require the Bot to decode it first.                                                |
| `ignoreResponse=true`                 | Makes the channel one-way, for analyzers that never read a reply. See [One-way channels](#one-way-channels).                                       |

## Framing: one session per message

An ASTM session looks like this on the wire:

```
--> ENQ
<-- ACK
--> STX 1 H|\^&|||... CR ETX C1C2 CR LF
<-- ACK
--> STX 2 P|1|... CR ETX C1C2 CR LF
<-- ACK
--> EOT
```

Framing on `ENQ`/`EOT` (`startChar=%05&endChar=%04`) makes the Agent treat everything between them
as a single message, so the Bot receives the complete result set — `H` through `L` — in one
invocation.

:::danger Do not frame on `STX`/`ETX`

`startChar=%02&endChar=%03` looks natural, since `STX` and `ETX` delimit each frame. It will deliver
**one message per frame**, so a Bot that needs the header, order, and result records together sees
them split across several invocations with no way to correlate them.

:::

## Link-level acknowledgement

E1381 expects exactly one `ACK` per frame. `autoRespond` answers these at the byte level, before
framing and without involving the Bot, which is what lets an analyzer proceed without waiting on a
round trip to the server.

| Byte           | Rule      | Acknowledged? | Notes                                                       |
| -------------- | --------- | ------------- | ----------------------------------------------------------- |
| `ENQ` (`0x05`) | `%05:%06` | Yes           | Establishment.                                              |
| `ETX` (`0x03`) | `%03:%06` | Yes           | Terminates the **final** frame of a message.                |
| `ETB` (`0x17`) | `%17:%06` | Yes           | Terminates an **intermediate** frame of a split message.    |
| `EOT` (`0x04`) | —         | **No**        | Never acknowledged; the sender has already dropped to idle. |
| `LF` (`0x0A`)  | —         | **No**        | Not an ASTM acknowledgement point.                          |

Two mistakes are easy to make here:

- **Forgetting `%17:%06`.** Records longer than a frame are split, with every frame but the last
  terminated by `ETB` rather than `ETX`. Without a rule for `ETB` those frames go unanswered and the
  analyzer stalls, retransmits, and eventually aborts the session. Short messages work fine, so this
  often surfaces only once a larger result set arrives.
- **Mapping `%0A:%06` or `%04:%06`.** Every frame ends `CR LF`, so a rule on `LF` produces a _second_
  `ACK` for each frame. A sender expecting one reply per frame then runs permanently one ahead,
  reading frame N's `ACK` as the answer to frame N+1 — which means a frame that was actually rejected
  can be read as accepted. A rule on `EOT` sends an unsolicited `ACK` into the idle state, which
  stricter analyzers log as a protocol violation.

:::caution `autoRespond` cannot validate frames

It matches bytes; it does not parse frames or verify checksums, so it `ACK`s a corrupt frame exactly
as readily as a good one and can never send a `NAK`. Checksum-driven retransmission is not available
through this mechanism. If an analyzer depends on it, validate in the Bot and reconcile
out of band.

:::

## What the Bot receives

Filtering operates on bytes, not frames, so everything printable in the analyzer's framing survives.
A session arrives looking like this:

```text
1H|\^&|||Bio-Rad CDM System SN 12345^...|||||LIS||P|1|20260806041500<CR>
P|1||||Doe^John||19700101|M<CR>
O|1|511979^002^01^0002||^^^4||...<CR>
R|9|^^^A1c^AREA|5.2|NGSP|...<CR>
L|1|N<CR>
D5<CR><LF>
```

Two artifacts to plan for:

1. **Frame sequence numbers.** The `1` ahead of `H` is the frame number. It is an ASCII digit, so
   `stripControlChars` cannot remove it.
2. **Checksums.** The trailing `D5` is the frame checksum. Splitting on `CR` leaves it on a line of
   its own, where most parsers harmlessly ignore it.

### Frame packing changes which lines carry a sequence number

Only the **first record in each frame** is prefixed with the frame number. An analyzer that packs a
whole message into one frame produces exactly one prefix, on the `H` record — so `startsWith('O|1|')`
works. The same analyzer splitting that message across frames prefixes the first record of every
frame, and the same check silently stops matching.

Do not rely on the packing staying constant; it changes with result-set size, retransmissions, and
firmware. Normalize instead:

```ts
const lines = input
  .split(/\r\n?/)
  // Strip a frame sequence number only where one precedes a record type letter.
  .map((line) => line.replace(/^[0-7](?=[A-Z]\|)/, ''));
```

## One-way channels

Most analyzers send results and never read a reply — the link-level `ACK`s already told them the
message was accepted. Set `ignoreResponse=true` so the Bot's response is discarded rather than
written back to the socket.

Without it, every message writes something to the analyzer, and it is often not what you would
expect: when a Bot returns no value, the server substitutes the Bot's **execution logs** as the
response body. An analyzer sitting idle then receives kilobytes of unframed log text.

:::tip

An empty string is a falsy return value, so returning `''` still produces the execution-log
fallback. `ignoreResponse=true` is the reliable way to send nothing.

:::

## Sessions with no data

An analyzer with nothing to report may still open a session — `ENQ`, take the `ACK`, then `EOT`. Both
framing bytes are removed by `stripControlChars`, so what remains is a zero-length body, and the
Agent dispatches it to the Bot like any other message.

Guard against it at the top of the Bot rather than paying for a full execution per poll:

```ts
if (!input?.trim()) {
  return;
}
```

## Verifying a new channel

When bringing up an analyzer, confirm each layer separately — a failure at any one looks like
"nothing happened" from the outside:

1. **Link layer.** Watch the `ACK`s. Exactly one per frame, and none after `EOT`. Extra or missing
   `ACK`s point at the `autoRespond` rules.
2. **Framing.** Log the body's length and whether it contains `CR`. If there is no `CR`, check
   `keepControlChars`. If the body starts with a control byte instead of a record type letter, check
   `stripControlChars`.
3. **Parsing.** Log each line and which branch matched it. A `(no match)` on a record you expected to
   match is usually a frame sequence number, per
   [Frame packing](#frame-packing-changes-which-lines-carry-a-sequence-number).

A Bot that logs these and writes nothing is worth keeping around; channel [logs](./fetch-logs.md) and
the Bot's `AuditEvent` history together cover all three layers.
