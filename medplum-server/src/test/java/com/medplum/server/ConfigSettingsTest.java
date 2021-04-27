package com.medplum.server;

import static org.junit.jupiter.api.Assertions.*;

import org.junit.Test;

public class ConfigSettingsTest {

    @Test
    public void testLoadLocalhostConfig() {
        final var config = ConfigSettings.loadConfig();
        assertNotNull(config);
    }

    @Test
    public void testLoadNamedConfig() {
        final var config = ConfigSettings.loadConfig("www");
        assertNotNull(config);
    }
}
