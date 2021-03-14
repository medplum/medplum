package com.medplum.server;

import java.io.IOException;
import java.net.URI;
import java.util.Map;

import org.glassfish.jersey.netty.httpserver.NettyHttpContainerProvider;
import org.jose4j.lang.JoseException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class Main {
    private static final Logger LOG = LoggerFactory.getLogger(Main.class);
    private static final URI BASE_URI = URI.create("http://localhost:5000/");

    public static void main(final String[] args) throws IOException, JoseException {
        final Map<String, Object> config = ConfigSettings.loadConfig();

        NettyHttpContainerProvider.createServer(BASE_URI, new App(config), false);
        LOG.info("App started at: {}", BASE_URI);
        System.in.read();
    }
}
