---
sidebar_position: 202
---

# Server Profiling

Medplum is designed to be a critical component of system architecture. It is important that Medplum server is robust, performant, and scalable. Hand in hand with [Load Testing](/docs/self-hosting/load-testing), profiling the server is critical in understanding performance bottlenecks and scaling challenges.

This document describes how the Medplum team uses the [Node.js Profiler](https://nodejs.org/en/docs/guides/simple-profiling) to analyze server performance.

## Prerequisites

Make sure you first [Clone the repo](/docs/contributing/local-dev-setup#clone-the-repo) and [Run the stack](/docs/contributing/run-the-stack).

## Start the Profiler

During normal server-side development, developers use `npm run dev` to run the server in development mode. That

Change directories to `packages/server`:

```bash
cd packages/server
```

Build the server:

```bash
npm run build
```

Now run the server with the Node.js built-in profiler:

```bash
NODE_ENV=production node --prof dist/index.js
```

If you use a custom config file, you can add that as an optional parameter:

```bash
NODE_ENV=production node --prof dist/index.js file:medplum.docker.config.json
```

The server is now running with the profiler attached. Because we used `node` directly, the server will not automatically recompile or restart on changes. When the profiler is attached, you must manually rebuild and restart.

## Generate Load

Generating load depends on which aspect of the server that you want to profile.

For general guidance on using [Artillery](https://www.artillery.io/) to generate load, see the Medplum guide on [Load Testing](/docs/self-hosting/load-testing).

For a quick test of a single HTTP endpoint, we can use Artillery's `quick` mode:

```bash
artillery quick --count 20 --num 100 http://localhost:8103/healthcheck
```

Sample output:

```
All VUs finished. Total time: 3 seconds

--------------------------------
Summary report @ 16:54:23(-0700)
--------------------------------

http.codes.200: ................................................ 2000
http.request_rate: ............................................. 1702/sec
http.requests: ................................................. 2000
http.response_time:
  min: ......................................................... 1
  max: ......................................................... 19
  median: ...................................................... 3
  p95: ......................................................... 5
  p99: ......................................................... 6
http.responses: ................................................ 2000
vusers.completed: .............................................. 20
vusers.created: ................................................ 20
vusers.created_by_name.0: ...................................... 20
vusers.failed: ................................................. 0
vusers.session_length:
  min: ......................................................... 237.9
  max: ......................................................... 355.9
  median: ...................................................... 333.7
  p95: ......................................................... 354.3
  p99: ......................................................... 354.3
```

## Analyze Profiler Data

Switch back to your server, and terminate the process with Ctrl+C.

Since we ran our application using the `--prof` option, a tick file was generated in the same directory as your local run of the application. It should have the form `isolate-0xnnnnnnnnnnnn-v8.log`.

In order to make sense of this file, we need to use the tick processor bundled with the Node.js binary. To run the processor, use the `--prof-process` flag:

```bash
node --prof-process isolate-0xnnnnnnnnnnnn-v8.log > processed.txt
```

Open `processed.txt` in your favorite text editor. If you have worked with profiler data before, this should look familiar.

See the Node.js [Profiling](https://nodejs.org/en/docs/guides/simple-profiling) docs for full details on how to process and analyze that file.
