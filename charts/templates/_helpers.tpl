{{/*
Expand the name of the chart.
*/}}
{{- define "medplum.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
We truncate at 63 chars because some Kubernetes name fields are limited to this (by the DNS naming spec).
If release name contains chart name it will be used as a full name.
*/}}
{{- define "medplum.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "medplum.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "medplum.labels" -}}
helm.sh/chart: {{ include "medplum.chart" . }}
{{ include "medplum.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels
*/}}
{{- define "medplum.selectorLabels" -}}
app.kubernetes.io/name: {{ include "medplum.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Create the name of the service account to use
*/}}
{{- define "medplum.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "medplum.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}

{{/*
=============================================================================
DEPRECATED global.cloudProvider compatibility shim.

Everything below translates the removed cloudProvider enum into the explicit
values that replaced it, for one minor-version cycle. NOTES.txt prints a
deprecation warning when it is in use. No template outside this shim may
reference cloudProvider.
=============================================================================
*/}}

{{/*
Effective ingress enabled: honors the legacy ingress.deploy flag if present.
*/}}
{{- define "medplum.ingress.enabled" -}}
{{- if hasKey .Values.ingress "deploy" }}
{{- .Values.ingress.deploy }}
{{- else }}
{{- .Values.ingress.enabled }}
{{- end }}
{{- end }}

{{/*
Effective ingress host: ingress.host, falling back to legacy ingress.domain.
*/}}
{{- define "medplum.ingress.host" -}}
{{- default (.Values.ingress.domain | default "") .Values.ingress.host }}
{{- end }}

{{/*
Effective ingress class name: explicit ingress.className, else the class the
legacy cloudProvider enum implied.
*/}}
{{- define "medplum.ingress.className" -}}
{{- if .Values.ingress.className }}
{{- .Values.ingress.className }}
{{- else if eq .Values.global.cloudProvider "gcp" }}
{{- "gce" }}
{{- else if eq .Values.global.cloudProvider "azure" }}
{{- "azure-application-gateway" }}
{{- end }}
{{- end }}

{{/*
Effective ingress TLS list: ingress.tls, else synthesized from the legacy
Azure tlsSecretName + domain pair.
*/}}
{{- define "medplum.ingress.tls" -}}
{{- if .Values.ingress.tls }}
{{- toYaml .Values.ingress.tls }}
{{- else if and (eq .Values.global.cloudProvider "azure") (.Values.ingress.tlsSecretName | default "") }}
- hosts:
    - {{ include "medplum.ingress.host" . }}
  secretName: {{ .Values.ingress.tlsSecretName }}
{{- end }}
{{- end }}

{{/*
Effective pod labels: podLabels, plus the label the legacy Azure enum implied.
*/}}
{{- define "medplum.podLabels" -}}
{{- with .Values.podLabels }}
{{- toYaml . }}
{{- end }}
{{- if eq .Values.global.cloudProvider "azure" }}
azure.workload.identity/use: "true"
{{- end }}
{{- end }}
