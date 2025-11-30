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

	// Database and JPA
	implementation("org.springframework.boot:spring-boot-starter-data-jpa")
	implementation("org.flywaydb:flyway-core")
	implementation("org.flywaydb:flyway-database-postgresql")
	runtimeOnly("org.postgresql:postgresql")

	// Testing
	testImplementation("org.springframework.boot:spring-boot-starter-test")
	testRuntimeOnly("org.junit.platform:junit-platform-launcher")

	// Testcontainers
	testImplementation("org.springframework.boot:spring-boot-testcontainers")
	testImplementation("org.testcontainers:junit-jupiter")
	testImplementation("org.testcontainers:postgresql")
}

tasks.withType<Test> {
	useJUnitPlatform()
	finalizedBy(tasks.jacocoTestReport)

	// Testcontainers configuration for Podman on macOS
	// TESTCONTAINERS_RYUK_DISABLED prevents Ryuk from trying to mount the Docker socket
	environment("TESTCONTAINERS_RYUK_DISABLED", "true")
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
