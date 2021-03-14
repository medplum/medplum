package com.medplum.server;

import java.io.IOException;
import java.io.InputStream;
import java.util.Map;
import java.util.Properties;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class ConfigSettings {
    public static final String JDBC_URL = "medplum.jdbc.url";
    public static final String JDBC_USERNAME = "medplum.jdbc.username";
    public static final String JDBC_PASSWORD = "medplum.jdbc.password";
    public static final String AUTH_ISSUER = "medplum.auth.issuer";
    public static final String AUTH_AUDIENCE = "medplum.auth.audience";
    public static final String AUTH_TOKEN_URL = "medplum.auth.tokenUrl";
    public static final String AUTH_AUTHORIZE_URL = "medplum.auth.authorizeUrl";
    public static final String AUTH_USER_INFO_URL = "medplum.auth.userInfoUrl";
    public static final String AUTH_JWKS_URL = "medplum.auth.jwksUrl";
    private static final Logger LOG = LoggerFactory.getLogger(ConfigSettings.class);

    ConfigSettings() {
        throw new UnsupportedOperationException();
    }

    @SuppressWarnings({ "unchecked", "rawtypes" })
    public static Map<String, Object> loadConfig() {
        final Properties props = new Properties();
        try (final InputStream in = ConfigSettings.class.getClassLoader().getResourceAsStream("medplum.properties")) {
            props.load(in);
        } catch (final IOException ex) {
            LOG.warn("Error loading default settings: {}", ex.getMessage(), ex);
        }
        return (Map) props;
    }
}
