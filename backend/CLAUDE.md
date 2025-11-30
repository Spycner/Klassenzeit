# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@../CLAUDE.md

## Project Overview

Klassenzeit is a timetabler application for schools. This is the backend component built with Spring Boot 3.5.8 and Java 21.

## Build Commands

```bash
# Build the project
./gradlew build

# Run the application
./gradlew bootRun

# Run all tests
./gradlew test

# Run a single test class
./gradlew test --tests "com.klassenzeit.klassenzeit.KlassenzeitApplicationTests"

# Run a single test method
./gradlew test --tests "com.klassenzeit.klassenzeit.KlassenzeitApplicationTests.contextLoads"

# Clean build
./gradlew clean build
```

## Code Quality

```bash
# Format code (auto-fix)
./gradlew spotlessApply

# Check formatting only
./gradlew spotlessCheck

# Run all quality checks (Spotless, Checkstyle, SpotBugs, PMD, tests)
./gradlew check

# Run tests with coverage report
./gradlew test jacocoTestReport

# View coverage report
open build/reports/jacoco/test/html/index.html
```

Tools configured:
- **Spotless**: Code formatting (Google Java Format)
- **Checkstyle**: Style rules (Google style)
- **SpotBugs**: Bug detection
- **PMD**: Code smell detection
- **JaCoCo**: Coverage reports

## Architecture

- **Framework**: Spring Boot 3.5.8 with Gradle (Kotlin DSL)
- **Java Version**: 21
- **Package Structure**: `com.klassenzeit.klassenzeit`
- **Entry Point**: `KlassenzeitApplication.java`
- **Configuration**: `src/main/resources/application.yaml`
