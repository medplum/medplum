package com.medplum.server.fhir.r4.repo;

import java.io.IOException;
import java.io.InputStream;

import com.medplum.fhir.r4.types.Binary;

public interface BinaryStorage {

    /**
     * Returns an InputStream with the data for the specified binary resource.
     * @param binary The binary resource definition (not including data).
     * @return The binary data input stream.
     */
    InputStream readBinary(Binary binary) throws IOException;

    /**
     * Writes the data for a Binary resource.
     * @param binary The binary resource definition (not including data).
     * @param inputStream The data input stream.
     */
    void writeBinary(Binary binary, InputStream inputStream) throws IOException;

}
