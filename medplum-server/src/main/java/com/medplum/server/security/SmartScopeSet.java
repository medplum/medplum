package com.medplum.server.security;

import java.util.Map;

public class SmartScopeSet {
    public static final String WILDCARD_RESOURCE = "*";
    private final Map<String, AccessLevel> patientResources;
    private final Map<String, AccessLevel> userResources;
    private final boolean profile;
    private final boolean launch;
    private final boolean offline;
    private final boolean online;

    public SmartScopeSet(final Map<String, AccessLevel> patientResources, final Map<String, AccessLevel> userResources,
            final boolean profile, final boolean launch, final boolean offline, final boolean online) {
        this.patientResources = patientResources;
        this.userResources = userResources;
        this.profile = profile;
        this.launch = launch;
        this.offline = offline;
        this.online = online;
    }

    public boolean hasProfileAccess() {
        return profile;
    }

    public boolean hasLaunchAccess() {
        return launch;
    }

    public boolean hasOfflineAccess() {
        return offline;
    }

    public boolean hasOnlineAccess() {
        return online;
    }

    public boolean canRead(final String resourceType) {
        return canRead(patientResources.get(resourceType)) ||
                canRead(patientResources.get(WILDCARD_RESOURCE)) ||
                canRead(userResources.get(resourceType)) ||
                canRead(userResources.get(WILDCARD_RESOURCE));
    }

    public boolean canWrite(final String resourceType) {
        return canWrite(patientResources.get(resourceType)) ||
                canWrite(patientResources.get(WILDCARD_RESOURCE)) ||
                canWrite(userResources.get(resourceType)) ||
                canWrite(userResources.get(WILDCARD_RESOURCE));
    }

    private static boolean canRead(final AccessLevel accessLevel) {
        return accessLevel == AccessLevel.READ || accessLevel == AccessLevel.WILDCARD;
    }

    private static boolean canWrite(final AccessLevel accessLevel) {
        return accessLevel == AccessLevel.WRITE || accessLevel == AccessLevel.WILDCARD;
    }
}
