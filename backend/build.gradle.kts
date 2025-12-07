plugins {
	java
	id("org.springframework.boot") version "3.5.8"
	id("io.spring.dependency-management") version "1.1.7"
	id("com.diffplug.spotless") version "7.0.4"
	id("com.github.spotbugs") version "6.1.12"
	checkstyle
	pmd
	jacoco
}

group = "com.klassenzeit"
version = "0.0.1-SNAPSHOT"
description = "Timetabler for schools"

java {
	toolchain {
		languageVersion = JavaLanguageVersion.of(21)
	}
}

repositories {
	mavenCentral()
}

dependencies {
	implementation("org.springframework.boot:spring-boot-starter")
	implementation("org.springframework.boot:spring-boot-starter-web")
	implementation("org.springframework.boot:spring-boot-starter-validation")
	implementation("org.springframework.boot:spring-boot-starter-actuator")

	// API Documentation
	implementation("org.springdoc:springdoc-openapi-starter-webmvc-ui:2.8.9")

	// Database and JPA
	implementation("org.springframework.boot:spring-boot-starter-data-jpa")
	implementation("org.flywaydb:flyway-core")
	implementation("org.flywaydb:flyway-database-postgresql")
	runtimeOnly("org.postgresql:postgresql")

	// Security (Keycloak / OAuth2)
	implementation("org.springframework.boot:spring-boot-starter-security")
	implementation("org.springframework.boot:spring-boot-starter-oauth2-resource-server")

	// Timefold Solver
	implementation("ai.timefold.solver:timefold-solver-spring-boot-starter:1.28.0")

	// Testing
	testImplementation("org.springframework.boot:spring-boot-starter-test")
	testImplementation("org.springframework.security:spring-security-test")
	testRuntimeOnly("org.junit.platform:junit-platform-launcher")

	// Testcontainers
	testImplementation("org.springframework.boot:spring-boot-testcontainers")
	testImplementation("org.testcontainers:junit-jupiter")
	testImplementation("org.testcontainers:postgresql")

	// Timefold Solver Test
	testImplementation("ai.timefold.solver:timefold-solver-test:1.28.0")
}

tasks.withType<Test> {
	useJUnitPlatform()
	finalizedBy(tasks.jacocoTestReport)
}

// Pass environment variables to bootRun JVM
tasks.named<org.springframework.boot.gradle.tasks.run.BootRun>("bootRun") {
	// Pass through specific environment variables to the JVM (supports comma-separated list)
	System.getenv("PLATFORM_ADMIN_EMAILS")?.let {
		systemProperty("klassenzeit.security.platform-admin-emails", it)
	}
}

// Spotless - Code formatting (like ruff format)
spotless {
	java {
		googleJavaFormat()
		removeUnusedImports()
		trimTrailingWhitespace()
		endWithNewline()
	}
}

// Checkstyle - Style rules
checkstyle {
	toolVersion = "10.25.0"
	configFile = file("config/checkstyle/checkstyle.xml")
	isIgnoreFailures = false
}

// SpotBugs - Bug detection
spotbugs {
	ignoreFailures = false
	showStackTraces = true
	showProgress = true
	reportsDir = layout.buildDirectory.dir("reports/spotbugs")
	excludeFilter = file("config/spotbugs/exclusions.xml")
}

tasks.withType<com.github.spotbugs.snom.SpotBugsTask>().configureEach {
	reports.create("html") {
		required = true
		outputLocation = layout.buildDirectory.file("reports/spotbugs/${name}.html")
	}
}

// PMD - Code smell detection
pmd {
	toolVersion = "7.13.0"
	isConsoleOutput = true
	isIgnoreFailures = false
	ruleSetFiles = files("config/pmd/ruleset.xml")
}

// JaCoCo - Code coverage reports
jacoco {
	toolVersion = "0.8.13"
}

tasks.jacocoTestReport {
	dependsOn(tasks.test)
	reports {
		xml.required = true
		html.required = true
	}
}
