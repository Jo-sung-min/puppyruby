FROM gradle:8.14.3-jdk21 AS build
WORKDIR /app/backend
COPY backend/build.gradle backend/settings.gradle ./
COPY backend/src ./src
COPY shared /app/shared
RUN gradle bootJar --no-daemon

FROM eclipse-temurin:21-jre-alpine
WORKDIR /app
RUN addgroup -S puppy && adduser -S puppy -G puppy
COPY --from=build --chown=puppy:puppy /app/backend/build/libs/puppyruby-api-*.jar app.jar
USER puppy
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]
