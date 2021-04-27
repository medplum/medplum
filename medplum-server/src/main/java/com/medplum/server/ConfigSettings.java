package com.medplum.server;

import java.io.File;
import java.io.FileReader;
import java.io.IOException;
import java.util.Map;
import java.util.Properties;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import com.medplum.fhir.JsonUtils;

import software.amazon.awssdk.services.secretsmanager.SecretsManagerClient;
import software.amazon.awssdk.services.secretsmanager.model.GetSecretValueRequest;
import software.amazon.awssdk.services.ssm.SsmClient;
import software.amazon.awssdk.services.ssm.model.GetParametersByPathRequest;

public class ConfigSettings {
    public static final String BASE_URL = "medplum.baseUrl";
    public static final String JDBC_DRIVER_CLASS_NAME = "medplum.jdbc.driverClassName";
    public static final String JDBC_URL = "medplum.jdbc.url";
    public static final String JDBC_USERNAME = "medplum.jdbc.username";
    public static final String JDBC_PASSWORD = "medplum.jdbc.password";
    public static final String AUTH_ISSUER = "medplum.auth.issuer";
    public static final String AUTH_AUDIENCE = "medplum.auth.audience";
    public static final String AUTH_TOKEN_URL = "medplum.auth.tokenUrl";
    public static final String AUTH_AUTHORIZE_URL = "medplum.auth.authorizeUrl";
    public static final String AUTH_USER_INFO_URL = "medplum.auth.userInfoUrl";
    public static final String AUTH_JWKS_URL = "medplum.auth.jwksUrl";
    public static final String AWS_DATABASE_SECRETS = "DatabaseSecrets";
    public static final String AWS_DATABASE_ENGINE = "engine";
    public static final String AWS_DATABASE_NAME = "dbname";
    public static final String AWS_DATABASE_PORT = "port";
    public static final String AWS_DATABASE_HOST = "host";
    public static final String AWS_DATABASE_USERNAME = "username";
    public static final String AWS_DATABASE_PASSWORD = "password";
    private static final Logger LOG = LoggerFactory.getLogger(ConfigSettings.class);

    ConfigSettings() {
        throw new UnsupportedOperationException();
    }

    @SuppressWarnings({ "unchecked", "rawtypes" })
    public static Map<String, Object> loadConfig(final String... args) {
        final var props = new Properties();
        loadDefaultSettings(props);
        loadLocalOverrideSettings(props);

        if (args != null && args.length > 0) {
            final var name = args[0];
            final var file = new File(name);
            if (file.exists()) {
                loadConfigFile(props, file);
            } else {
                loadAwsParams(props, name);
            }
        } else {
            LOG.info("Using default dev settings");
        }

        return (Map) props;
    }

    private static void loadDefaultSettings(final Properties props) {
        try (final var in = ConfigSettings.class.getClassLoader().getResourceAsStream("medplum.properties")) {
            props.load(in);
        } catch (final IOException ex) {
            LOG.warn("Error loading default settings: {}", ex.getMessage(), ex);
        }
    }

    private static void loadLocalOverrideSettings(final Properties props) {
        try (final var in = ConfigSettings.class.getClassLoader().getResourceAsStream("medplum.local.properties")) {
            if (in != null) {
                props.load(in);
            }
        } catch (final IOException ex) {
            LOG.debug("Error loading local override settings: {}", ex.getMessage(), ex);
        }
    }

    private static void loadConfigFile(final Properties props, final File file) {
        LOG.info("Loading local config settings from \"{}\"", file);
        try (final var reader = new FileReader(file)) {
            props.load(reader);
        } catch (final IOException ex) {
            LOG.warn("Error loading config settings: {}", ex.getMessage(), ex);
        }
    }

    private static void loadAwsParams(final Properties props, final String envName) {
        final var path = String.format("/medplum/%s/", envName);
        LOG.info("Loading AWS Parameter Store settings from \"{}\"", path);

        final var ssm = SsmClient.builder().build();
        for (final var response : ssm.getParametersByPathPaginator(GetParametersByPathRequest.builder()
                .path(path)
                .build())) {

            for (final var param : response.parameters()) {
                final var key = param.name().substring(path.length());
                final var value = param.value();
                LOG.debug("  \"{}\" = \"{}\"", key, value);
                props.put(key, value);

                if (key.equals(AWS_DATABASE_SECRETS)) {
                    loadDatabaseSecrets(props, value);
                }
            }
        }
    }

    private static void loadDatabaseSecrets(final Properties props, final String secretId) {
        LOG.info("Loading AWS Secrets from \"{}\"", secretId);

        final var client = SecretsManagerClient.builder().build();
        final var response = client.getSecretValue(GetSecretValueRequest.builder()
                .secretId(secretId)
                .build());

        final var secret = JsonUtils.readJsonString(response.secretString());
        final var engine = secret.getString(AWS_DATABASE_ENGINE);
        final String driverClassName;
        final String url;

        switch (engine) {
        case "postgres":
            driverClassName = "org.postgresql.Driver";
            url = String.format(
                    "jdbc:postgresql://%s:%d/%s",
                    secret.getString(AWS_DATABASE_HOST),
                    secret.getInt(AWS_DATABASE_PORT),
                    secret.getString(AWS_DATABASE_NAME));
            break;

        default:
            throw new IllegalStateException("Unrecognized database engine: " + engine);
        }

        props.put(JDBC_DRIVER_CLASS_NAME, driverClassName);
        props.put(JDBC_URL, url);
        props.put(JDBC_USERNAME, secret.getString(AWS_DATABASE_USERNAME));
        props.put(JDBC_PASSWORD, secret.getString(AWS_DATABASE_PASSWORD));
    }
}
