package com.medplum.server.fhir.repo;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import com.medplum.fhir.types.Binary;

public class FileSystemBinaryStorage implements BinaryStorage {
    private static final Logger LOG = LoggerFactory.getLogger(FileSystemBinaryStorage.class);

    @Override
    public InputStream readBinary(final Binary binary) throws IOException {
        LOG.info("Read binary id={} vid={}", binary.id(), binary.meta().versionId());
        return Files.newInputStream(binaryToPath(binary));
    }

    @Override
    public void writeBinary(final Binary binary, final InputStream inputStream) throws IOException {
        LOG.info("Write binary id={} vid={}", binary.id(), binary.meta().versionId());
        Files.copy(inputStream, binaryToPath(binary));
    }

    private static Path binaryToPath(final Binary binary) throws IOException {
        final Path dir = Paths.get("binary", binary.id());
        Files.createDirectories(dir);
        return dir.resolve(binary.meta().versionId());
    }
}
