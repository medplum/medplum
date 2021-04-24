FROM public.ecr.aws/w1m2m2a3/amazoncorretto:11
ENTRYPOINT ["java", "-jar", "/opt/medplum/medplum-server.jar"]
ARG JAR_FILE
ADD target/${JAR_FILE} /opt/medplum/medplum-server.jar
