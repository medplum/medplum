# AWS Athena Guide

When self-hosting on AWS, you may need to perform data analytics on production traffic. AWS CloudWatch is usually the starting point for basic analytics. But sometimes you need more granular control over specific queries, such as filtering by IP address, HTTP verb, or HTTP status code.

AWS Athena is an interactive query tool that makes it easy to analyze data stored in AWS S3. It is designed to work with log data stored in S3, such as logs from AWS VPC, AWS Application Load Balancer (ALB), and many other AWS services.

In this guide, we will describe how to setup AWS Athena for querying AWS log data.

:::caution

AWS Athena is a paid service, so each query can incur a cost.

Most AWS log data is organized by date. If you follow the instructions in this document and always use date/time bounds on your queries, the pricing is de minimis.

For example, all of the queries in this guide scan less than the 10 MB minimum. At $5.00 per TB of data scanned, it would take 100,000 queries to reach the $5.00 price point.

See [Athena Pricing](https://aws.amazon.com/athena/pricing/) for more details.

:::

For more background reading, see [What is Amazon Athena?](https://docs.aws.amazon.com/athena/latest/ug/what-is.html) and [Querying Application Load Balancer logs](https://docs.aws.amazon.com/athena/latest/ug/application-load-balancer-logs.html).

## Athena for ALB Logs

### Prerequisites

First, you must enable access logs so that AWS Application Load Balancer logs are saved to an AWS S3 bucket. Medplum makes this easy using the CDK config file. Add the following lines to your CDK config file:

```json
  "loadBalancerLoggingEnabled": true,
  "loadBalancerLoggingBucket": "medplum-logs-us-east-1",
  "loadBalancerLoggingPrefix": "elb-staging",
```

And then deploy the CDK changes. See [Medplum Config Settings](./config-settings) and [Install on AWS](./install-on-aws) for more details.

Next, if you do not have a "default" Athena database, follow [Creating databases in Athena](https://docs.aws.amazon.com/athena/latest/ug/creating-databases.html).

### Creating the table for ALB logs

Now that ALB access logs are enabled and stored in S3, we can create an Athena table for the data.

Because ALB logs have a known structure whose partition scheme you can specify in advance, you can reduce query runtime and automate partition management by using the Athena partition projection feature. Partition projection automatically adds new partitions as new data is added.

Use this query from [Creating the table for ALB logs in Athena using partition projection](https://docs.aws.amazon.com/athena/latest/ug/application-load-balancer-logs.html#create-alb-table-partition-projection):

```sql
CREATE EXTERNAL TABLE IF NOT EXISTS alb_access_logs (
    type string,
    time string,
    elb string,
    client_ip string,
    client_port int,
    target_ip string,
    target_port int,
    request_processing_time double,
    target_processing_time double,
    response_processing_time double,
    elb_status_code int,
    target_status_code string,
    received_bytes bigint,
    sent_bytes bigint,
    request_verb string,
    request_url string,
    request_proto string,
    user_agent string,
    ssl_cipher string,
    ssl_protocol string,
    target_group_arn string,
    trace_id string,
    domain_name string,
    chosen_cert_arn string,
    matched_rule_priority string,
    request_creation_time string,
    actions_executed string,
    redirect_url string,
    lambda_error_reason string,
    target_port_list string,
    target_status_code_list string,
    classification string,
    classification_reason string,
    conn_trace_id string
) PARTITIONED BY (day STRING) ROW FORMAT SERDE 'org.apache.hadoop.hive.serde2.RegexSerDe' WITH SERDEPROPERTIES (
    'serialization.format' = '1',
    'input.regex' = '([^ ]*) ([^ ]*) ([^ ]*) ([^ ]*):([0-9]*) ([^ ]*)[:-]([0-9]*) ([-.0-9]*) ([-.0-9]*) ([-.0-9]*) (|[-0-9]*) (-|[-0-9]*) ([-0-9]*) ([-0-9]*) \"([^ ]*) (.*) (- |[^ ]*)\" \"([^\"]*)\" ([A-Z0-9-_]+) ([A-Za-z0-9.-]*) ([^ ]*) \"([^\"]*)\" \"([^\"]*)\" \"([^\"]*)\" ([-.0-9]*) ([^ ]*) \"([^\"]*)\" \"([^\"]*)\" \"([^ ]*)\" \"([^\s]+?)\" \"([^\s]+)\" \"([^ ]*)\" \"([^ ]*)\" ?([^ ]*)?( .*)?'
) LOCATION 's3://DOC-EXAMPLE-BUCKET/AWSLogs/<ACCOUNT-NUMBER>/elasticloadbalancing/<REGION>/' TBLPROPERTIES (
    "projection.enabled" = "true",
    "projection.day.type" = "date",
    "projection.day.range" = "2022/01/01,NOW",
    "projection.day.format" = "yyyy/MM/dd",
    "projection.day.interval" = "1",
    "projection.day.interval.unit" = "DAYS",
    "storage.location.template" = "s3://DOC-EXAMPLE-BUCKET/AWSLogs/<ACCOUNT-NUMBER>/elasticloadbalancing/<REGION>/${day}"
)
```

Now Athena is ready for querying.

### Querying ALB logs

:::caution

As mentioned above, AWS Athena is a paid service, so each query can incur a cost.

Most AWS log data is organized by date. If you follow the instructions in this document and always use date/time bounds on your queries, the pricing is de minimis.

See [Athena Pricing](https://aws.amazon.com/athena/pricing/) for more details.

:::

Count status codes by day:

```sql
SELECT
    COUNT(elb_status_code) AS count,
    elb_status_code
FROM
    alb_logs
WHERE
    day = '2023/06/18'
GROUP BY
    elb_status_code
LIMIT
    100;
```

Find all 500 errors

```sql
SELECT
    elb_status_code,
    time,
    client_ip,
    request_verb,
    request_url,
    request_processing_time,
    target_processing_time,
    response_processing_time
FROM
    alb_logs
WHERE
    day = '2023/09/27'
    AND "elb_status_code">=500
ORDER BY time
LIMIT
    100;
```

Count status codes by day and by client IP address:

```sql
SELECT
    COUNT(elb_status_code) AS count,
    elb_status_code,
    client_ip
FROM
    alb_logs
WHERE
    day = '2023/06/18'
GROUP BY
    elb_status_code,
    client_ip
LIMIT
    100;
```

Count Safari browser users:

```sql
SELECT
    request_url
FROM
    alb_logs
WHERE
    user_agent LIKE '%Safari%'
    AND day = '2023/06/18'
LIMIT
    10;
```

Parse logs by `datetime`:

```sql
SELECT
    client_ip,
    sum(received_bytes)
FROM
    alb_logs
WHERE
    parse_datetime(time, 'yyyy-MM-dd''T''HH:mm:ss.SSSSSS''Z')
    BETWEEN parse_datetime('2023-05-30-12:00:00', 'yyyy-MM-dd-HH:mm:ss')
    AND parse_datetime('2023-05-31-00:00:00', 'yyyy-MM-dd-HH:mm:ss')
GROUP BY
    client_ip;
```

## Athena for Medplum Bot logs

### Creating the table

Medplum Bots automatically write input to S3 on every invocation.

Medplum Bot logs have a known structure whose partition scheme you can specify in advance, you can reduce query runtime and automate partition management by using the Athena partition projection feature. Partition projection automatically adds new partitions as new data is added.

```sql
CREATE EXTERNAL TABLE my_bot_logs (
    botId STRING,
    projectId STRING,
    accountId STRING,
    agentId STRING,
    deviceId STRING,
    remoteAddress STRING,
    forwardedFor STRING,
    contentType STRING,
    input STRING,
    hl7SendingApplication STRING,
    hl7SendingFacility STRING,
    hl7ReceivingApplication STRING,
    hl7ReceivingFacility STRING,
    hl7MessageType STRING,
    hl7Version STRING,
    hl7PidId STRING,
    hl7PidMrn STRING,
    hl7ObxId STRING,
    hl7ObxAccession STRING
)
PARTITIONED BY (
   date STRING
)
ROW FORMAT SERDE 'org.openx.data.jsonserde.JsonSerDe'
STORED AS INPUTFORMAT 'org.apache.hadoop.mapred.TextInputFormat'
OUTPUTFORMAT 'org.apache.hadoop.hive.ql.io.HiveIgnoreKeyTextOutputFormat'
LOCATION 's3://MY_STORAGE_BUCKET/bot/MY_PROJECT_ID/'
TBLPROPERTIES (
    "projection.enabled" = "true",
    "projection.date.type" = "date",
    "projection.date.range" = "2022/01/01,NOW",
    "projection.date.format" = "yyyy/MM/dd",
    "projection.date.interval" = "1",
    "projection.date.interval.unit" = "DAYS",
    "storage.location.template" = "s3://MY_STORAGE_BUCKET/bot/MY_PROJECT_ID/${date}/"
);
```

### Querying

Count HL7 message types by day:

```sql
SELECT hl7MessageType, COUNT(hl7MessageType) AS count
FROM my_bot_logs
WHERE date >= '2023-01-01'
GROUP BY hl7MessageType
LIMIT 100;
```

## Additional Reading

- [What is Amazon Athena](https://docs.aws.amazon.com/athena/latest/ug/what-is.html)
- [SQL reference for Athena](https://docs.aws.amazon.com/athena/latest/ug/ddl-sql-reference.html)
