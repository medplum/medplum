---
sidebar_position: 900
---

# OpenTelemetry

This page describes Medplum's optional OpenTelemetry support, and how to integrate with AWS CloudWatch.

## Introduction to OpenTelemetry

**OpenTelemetry** is an observability framework for cloud-native software, providing a comprehensive suite of tools, APIs, and SDKs to capture metrics, traces, and logs from your application. It's a CNCF (Cloud Native Computing Foundation) project, created through the merger of OpenTracing and OpenCensus.

### Key Concepts of OpenTelemetry

1. **Metrics**: Metrics are numerical values that represent the measurements of different aspects of your application and infrastructure performance, like request count, error rates, or resource utilization. They are crucial for monitoring the health and performance of your application.

2. **Traces**: Traces represent the journey of a single request as it travels through various services in your application. They help in understanding the flow and latency of requests, which is essential for diagnosing and debugging distributed systems.

3. **Exporters**: Exporters are components in OpenTelemetry that send telemetry data (metrics, traces, logs) to backend observability platforms like Prometheus, Jaeger, or AWS CloudWatch. They are responsible for converting the data into a format that the backend systems can understand.

4. **Collectors**: The OpenTelemetry Collector offers a vendor-agnostic implementation for receiving, processing, and exporting telemetry data. It's a standalone service that can be deployed alongside your application, providing a centralized way to gather and dispatch observability data.

## Introduction to AWS Distro for OpenTelemetry

**AWS Distro for OpenTelemetry (ADOT)** is a secure and scalable observability solution provided by AWS, designed to integrate seamlessly with the broader OpenTelemetry ecosystem. As an AWS-supported distribution of the OpenTelemetry project, ADOT simplifies the process of collecting, processing, and exporting telemetry data — including metrics, traces, and logs — from your applications and infrastructure. By facilitating the collection of rich, detailed observability data, ADOT enables developers and operators to gain deeper insights into the performance and health of their applications. Furthermore, ADOT's integration with AWS CloudWatch provides a powerful platform for monitoring and analysis, allowing teams to leverage the robust features of CloudWatch for metrics storage, alerting, and dashboarding. This integration forms a comprehensive observability pipeline, from data collection with ADOT to data analysis and visualization with AWS CloudWatch, offering a cohesive solution for monitoring modern cloud-native applications on AWS.

## Using OpenTelemetry

### OpenTelemetry on localhost

When running on localhost, OpenTelemetry is disabled by default. To enable OpenTelemetry, follow these steps:

#### 1. Start an OpenTelemetry Collector

If you already have a running OpenTelemetry Collector, you can skip this step.

Start the default OpenTelemetry Collector using Docker:

On Mac/Linux:

```bash
docker run -p 4317:4317 -p 4318:4318 --rm -v $(pwd)/collector-config.yaml:/etc/otelcol/config.yaml otel/opentelemetry-collector
```

On Windows:

```bat
docker run -p 4317:4317 -p 4318:4318 --rm -v %cd%\collector-config.yaml:/etc/otelcol/config.yaml otel/opentelemetry-collector
```

#### 2. Add the OpenTelemetry config settings

OpenTelemetry cannot be configured through the normal `medplum.config.json` file, because it instruments Node.js and dependencies.

Instead, you must add the following environment variables:

```bash
export OTLP_TRACES_ENDPOINT="http://localhost:4318/v1/traces"
export OTLP_METRICS_ENDPOINT="http://localhost:4318/v1/metrics"
```

#### 3. Restart the Medplum server

Ctrl+C to stop the server, then `npm run dev` to restart.

### OpenTelemetry on AWS

First, make sure you go through all steps in [Install on AWS](/docs/self-hosting/install-on-aws). You should have a Medplum CDK JSON config file and a running cluster.

Use the Medplum "additional containers" feature to add the AWS CloudWatch Agent as an OpenTelemetry collector.

Next, add the following to your Medplum CDK JSON config file:

1. Environment variables as described above
2. "Additional containers" for the AWS OpenTelemetry collector ("ADOT Collector")

```js
{
  "name": "staging",
  "region": "us-east-1",
  "stackName": "MedplumStagingStack",
  // ...
  "environment": {
    "OTLP_TRACES_ENDPOINT": "http://localhost:4318/v1/traces",
    "OTLP_METRICS_ENDPOINT": "http://localhost:4318/v1/metrics"
  },
  // ...
  "additionalContainers": [
    {
      "name": "aws-otel-collector",
      "image": "amazon/aws-otel-collector:latest",
      "command": ["--config=/etc/ecs/ecs-default-config.yaml"]
    }
  ]
}
```

After you modify your Medplum CDK JSON config file, apply the changes using the CDK command line tools.

Run `diff` to see changes:

```bash
npx cdk diff -c config=my-config-file.json
```

Run `deploy` to apply changes:

```bash
npx cdk deploy -c config=my-config-file.json
```

## OpenTelemetry Resources

- [OpenTelemetry](https://opentelemetry.io/)
- [OpenTelemetry Node.js Getting Started](https://opentelemetry.io/docs/instrumentation/js/getting-started/nodejs/)
- [OpenTelemetry Node.js Exporters](https://opentelemetry.io/docs/instrumentation/js/exporters/)
- [AWS CloudWatch Agent](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/Install-CloudWatch-Agent.html)
