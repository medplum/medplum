package com.medplum.server.security;

import java.util.HashMap;
import java.util.Map;

public class SmartScopeParser {

    public static SmartScopeSet parse(final String scopesStr) {
        final Map<String, AccessLevel> patientResources = new HashMap<>();
        final Map<String, AccessLevel> userResources = new HashMap<>();
        boolean profile = false;
        boolean launch = false;
        boolean offline = false;
        boolean online = false;

        for (final String scopeStr : scopesStr.split(" ")) {

            if (scopeStr.equals("openid") || scopeStr.equals("profile") || scopeStr.equals("fhirUser")) {
                profile = true;

            } else if (scopeStr.equals("launch") || scopeStr.equals("launch/patient")) {
                launch = true;

            } else if (scopeStr.equals("offline_access")) {
                offline = true;

            } else if (scopeStr.equals("online_access")) {
                online = true;

            } else if (scopeStr.startsWith("patient/")) {
                final String[] parts = parseToken(scopeStr);
                final String resourceType = parts[1];
                final AccessLevel accessLevel = parseAccessLevel(parts[2]);
                patientResources.put(resourceType, accessLevel);

            } else if (scopeStr.startsWith("user/")) {
                final String[] parts = parseToken(scopeStr);
                final String resourceType = parts[1];
                final AccessLevel accessLevel = parseAccessLevel(parts[2]);
                userResources.put(resourceType, accessLevel);
            }
        }

        return new SmartScopeSet(patientResources, userResources, profile, launch, offline, online);
    }

    private static String[] parseToken(final String scopeStr) {
        final int slashIndex = scopeStr.indexOf('/');
        if (slashIndex < 0) {
            throw new RuntimeException("Invalid scope string: missing slash");
        }

        final int periodIndex = scopeStr.indexOf('.', slashIndex);
        if (periodIndex < 0) {
            throw new RuntimeException("Invalid scope string: missing period");
        }

        return new String[] {
                scopeStr.substring(0, slashIndex),
                scopeStr.substring(slashIndex + 1, periodIndex),
                scopeStr.substring(periodIndex + 1)
        };
    }

    private static AccessLevel parseAccessLevel(final String str) {
        switch (str) {
        case "read":
            return AccessLevel.READ;
        case "write":
            return AccessLevel.WRITE;
        case "*":
            return AccessLevel.WILDCARD;
        default:
            throw new RuntimeException("Invalid scope string: unknown access level '" + str + "'");
        }
    }
}
