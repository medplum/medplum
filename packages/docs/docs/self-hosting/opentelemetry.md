---
sidebar_position: 900
---

# OpenTelemetry Support

This page describes how to add the Datadog agent to your ECS Fargate tasks. Adding Datadog allows you to collect metrics from all containers.

## Introduction to OpenTelemetry

**OpenTelemetry** is an observability framework for cloud-native software, providing a comprehensive suite of tools, APIs, and SDKs to capture metrics, traces, and logs from your application. It's a CNCF (Cloud Native Computing Foundation) project, created through the merger of OpenTracing and OpenCensus.

### Key Concepts of OpenTelemetry

1. **Metrics**: Metrics are numerical values that represent the measurements of different aspects of your application and infrastructure performance, like request count, error rates, or resource utilization. They are crucial for monitoring the health and performance of your application.

2. **Traces**: Traces represent the journey of a single request as it travels through various services in your application. They help in understanding the flow and latency of requests, which is essential for diagnosing and debugging distributed systems.

3. **Exporters**: Exporters are components in OpenTelemetry that send telemetry data (metrics, traces, logs) to backend observability platforms like Prometheus, Jaeger, or AWS CloudWatch. They are responsible for converting the data into a format that the backend systems can understand.

4. **Collectors**: The OpenTelemetry Collector offers a vendor-agnostic implementation for receiving, processing, and exporting telemetry data. It's a standalone service that can be deployed alongside your application, providing a centralized way to gather and dispatch observability data.

## Introduction to AWS CloudWatch Agent

**AWS CloudWatch Agent** is a monitoring service provided by Amazon Web Services for collecting and tracking metrics and logs from your AWS resources and applications. It's a powerful tool for real-time monitoring and operational insights.

### Features of AWS CloudWatch Agent

1. **Collection of System-Level Metrics**: The CloudWatch Agent gathers system-level metrics such as CPU utilization, memory usage, disk I/O, and network bandwidth from your EC2 instances and on-premises servers.

2. **Application Log Monitoring**: It can also be configured to collect and monitor logs from your applications and services, providing insights into their operational behavior.

3. **Custom Metrics Support**: The CloudWatch Agent allows you to define and collect custom metrics specific to your application, enabling more detailed monitoring.

4. **Integration with AWS Services**: Being an AWS-native service, it seamlessly integrates with other AWS services, offering a centralized solution for monitoring AWS resources and applications.

5. **Flexibility and Configurability**: The CloudWatch Agent can be customized to suit specific monitoring needs, allowing for fine-grained control over what data is collected and how it's used.

## Using OpenTelemetry

### OpenTelemetry on localhost

When running on localhost, OpenTelemetry is disabled by default. To enable OpenTelemetry, follow these steps:

#### 1. Start the OpenTelemetry Collector

On Mac/Linux:

```bash
docker run -p 4317:4317 -p 4318:4318 --rm -v $(pwd)/collector-config.yaml:/etc/otelcol/config.yaml otel/opentelemetry-collector
```

On Windows:

```bat
docker run -p 4317:4317 -p 4318:4318 --rm -v %cd%\collector-config.yaml:/etc/otelcol/config.yaml otel/opentelemetry-collector
```

#### 2. Add the OpenTelemetry config settings

Update the `medplum.config.json` file or your custom config JSON file with the following values:

```js
  // HTTP endpoint of the OpenTelemetry trace collector
  otlpTraceEndpoint: "http://localhost:4318/v1/traces",
  // HTTP endpoint of the OpenTelemetry metrics collector
  otlpMetricsEndpoint: "http://localhost:4318/v1/metrics",
```

#### 3. Restart the Medplum server

Ctrl+C to stop the server, then `npm run dev` to restart.

### OpenTelemetry on AWS

First, make sure you go through all steps in [Install on AWS](/docs/self-hosting/install-on-aws). You should have a Medplum CDK JSON config file and a running cluster.

Use the Medplum "additional containers" feature to add the AWS CloudWatch Agent as an OpenTelemetry collector.

```js
{
  "name": "staging",
  "region": "us-east-1",
  "stackName": "MedplumStagingStack",
  // ...
  "additionalContainers": [
    {
      "name": "cloudwatch-agent",
      "image": "amazon/cloudwatch-agent:latest",
      "environment": {
        "CW_CONFIG_CONTENT": "{ \"logs\": { \"metrics_collected\": { \"emf\": {} } }, \"metrics\": { \"metrics_collected\": { \"statsd\": { \"service_address\": \":8125\" } } } }"
      }
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

For more details about the Datadog / Amazon ECS Fargate integration, refer to the full documentation: [https://docs.datadoghq.com/integrations/ecs_fargate/](https://docs.datadoghq.com/integrations/ecs_fargate/)

## OpenTelemetry Resources

- [OpenTelemetry](https://opentelemetry.io/)
- [OpenTelemetry Node.js Getting Started](https://opentelemetry.io/docs/instrumentation/js/getting-started/nodejs/)
- [OpenTelemetry Node.js Exporters](https://opentelemetry.io/docs/instrumentation/js/exporters/)
- [AWS CloudWatch Agent](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/Install-CloudWatch-Agent.html)
