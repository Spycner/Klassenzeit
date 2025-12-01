package com.klassenzeit.klassenzeit;

import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;

/**
 * Base class for integration tests that require a PostgreSQL database.
 *
 * <p>Uses Testcontainers to spin up a PostgreSQL container that is shared across all test classes
 * that extend this base class. The container is managed as a Spring bean via
 * TestContainersConfiguration to ensure proper lifecycle management across test classes.
 */
@SpringBootTest
@Import(TestContainersConfiguration.class)
@ActiveProfiles("test")
public abstract class AbstractIntegrationTest {
  // Container is now managed by Spring as a bean in TestContainersConfiguration
}
