package com.medplum.server;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import java.util.Arrays;

import jakarta.json.Json;

import org.junit.Test;

import software.amazon.awssdk.services.secretsmanager.SecretsManagerClient;
import software.amazon.awssdk.services.secretsmanager.model.GetSecretValueRequest;
import software.amazon.awssdk.services.secretsmanager.model.GetSecretValueResponse;
import software.amazon.awssdk.services.ssm.SsmClient;
import software.amazon.awssdk.services.ssm.model.GetParametersByPathRequest;
import software.amazon.awssdk.services.ssm.model.GetParametersByPathResponse;
import software.amazon.awssdk.services.ssm.model.Parameter;
import software.amazon.awssdk.services.ssm.paginators.GetParametersByPathIterable;

public class ConfigSettingsTest {

    @Test(expected = UnsupportedOperationException.class)
    public void testConstructor() {
        new ConfigSettings();
    }

    @Test
    public void testLoadLocalhostConfig() {
        final var config = ConfigSettings.loadConfig(null, null);
        assertNotNull(config);
    }

    @Test
    public void testLoadNamedConfig() {
        final var envName = "test";
        final var prefix = "/medplum/" + envName + "/";

        final var response1 = GetParametersByPathResponse.builder()
                .parameters(Parameter.builder().name(prefix + "key").value("value").build())
                .build();

        final var response2 = GetParametersByPathResponse.builder()
                .parameters(Parameter.builder().name(prefix + "DatabaseSecrets").value("arn:123").build())
                .build();

        final var responses = Arrays.asList(response1, response2);

        final var params = mock(GetParametersByPathIterable.class);
        when(params.iterator()).thenReturn(responses.iterator());

        final var ssmClient = mock(SsmClient.class);
        when(ssmClient.getParametersByPathPaginator(any(GetParametersByPathRequest.class))).thenReturn(params);

        final var secretsResponse = GetSecretValueResponse.builder()
                .secretString(Json.createObjectBuilder()
                        .add("engine", "postgres")
                        .add("host", "1.2.3.4")
                        .add("port", 1234)
                        .add("dbname", "foo")
                        .add("username", "user")
                        .add("password", "pass")
                        .build()
                        .toString())
                .build();

        final var secretsClient = mock(SecretsManagerClient.class);
        when(secretsClient.getSecretValue(any(GetSecretValueRequest.class))).thenReturn(secretsResponse);

        final var config = ConfigSettings.loadConfig(ssmClient, secretsClient, envName);
        assertNotNull(config);
        assertEquals("value", config.get("key"));
    }
}
