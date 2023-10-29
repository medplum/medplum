---
sidebar_position: 2
tags: [auth]
---

# IP Access Rules

One valuable way to prevent unauthorized data access is to restrict access to clinical data by the user's IP address. This article will discuss the benefits of IP address restrictions and provide a step-by-step guide on configuring these settings in Medplum's [AccessPolicy](/docs/api/fhir/medplum/accesspolicy).

## Importance of IP Address Restrictions

IP address restrictions provide an additional layer of security by limiting access to your healthcare application based on the user's IP address. This ensures that only users from approved locations or networks can access the application, reducing the risk of unauthorized access or data breaches. Moreover, IP address restrictions can be an essential component of regulatory compliance for healthcare organizations, helping them adhere to strict data security requirements.

Medplum customers primarily use IP Access Restrictions to ensure that users are only accessing data from approved origins such as on-premise devices or corporate VPN.

## Setting Up IP Address Restrictions in Medplum

To configure IP address restrictions in Medplum, follow the steps below:

1. Log in to your Medplum account as a project administrator
2. Navigate to the AccessPolicy page (i.e., [https://app.medplum.com/AccessPolicy](https://app.medplum.com/AccessPolicy))
3. Select an existing AccessPolicy or click "New..." to create a new one
4. Scroll down to the section labeled "IP Access Rules"
5. In the "IP Access Rules" section, you can add "allow" and "block" rules based on IP addresses

The rules are evaluated sequentially until a matching rule is found. To effectively restrict access, start by specifying a series of "allow" rules for the desired IP addresses or IP address ranges.

Once you have specified all the "allow" rules, add a wildcard "block" rule at the end to block all other IP addresses. To do this, use an asterisk (\*) as the value for the "block" rule.

Please note that only IPv4 IP addresses are supported, and partial IP addresses can be used for matching. For example, specifying the value "8.8." would match "8.8.8.8" but would not match "8.7.8.8".
