FROM gradle:8.14.3-jdk21 AS build
WORKDIR /app
COPY build.gradle settings.gradle ./
COPY src ./src
RUN gradle bootJar --no-daemon

FROM eclipse-temurin:21-jre-alpine
WORKDIR /app
RUN addgroup -S puppy && adduser -S puppy -G puppy
COPY --from=build --chown=puppy:puppy /app/build/libs/puppyruby-api-0.1.0.jar app.jar
USER puppy
EXPOSE 8081
ENTRYPOINT ["java", "-jar", "app.jar"]
