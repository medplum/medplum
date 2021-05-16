package com.medplum.server;

import java.net.URI;
import java.util.Map;

import org.glassfish.jersey.grizzly2.httpserver.GrizzlyHttpServerFactory;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class Main {
    private static final Logger LOG = LoggerFactory.getLogger(Main.class);
    private static final URI BASE_URI = URI.create("http://localhost:5000/");

    public static void main(final String[] args) throws Exception {
        LOG.info("App starting with args: {}", (Object[]) args);
        final Map<String, Object> config = ConfigSettings.loadConfig(args);

        GrizzlyHttpServerFactory.createHttpServer(BASE_URI, new App(config), true);
        LOG.info("App started at: {}", BASE_URI);
        System.in.read();
    }
}
