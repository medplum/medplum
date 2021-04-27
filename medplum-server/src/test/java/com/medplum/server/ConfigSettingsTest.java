package com.medplum.server;

import static org.junit.jupiter.api.Assertions.*;

import org.junit.Ignore;
import org.junit.Test;

public class ConfigSettingsTest {

    @Test
    public void testLoadLocalhostConfig() {
        final var config = ConfigSettings.loadConfig();
        assertNotNull(config);
    }

    @Test
    @Ignore("Requires AWS creds, need to mock AWS client")
    public void testLoadNamedConfig() {
        final var config = ConfigSettings.loadConfig("www");
        assertNotNull(config);
    }
}
