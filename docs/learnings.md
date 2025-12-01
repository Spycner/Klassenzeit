# Learnings & Gotchas

Reference document for issues encountered and their solutions.

---

## Testcontainers with Spring Boot 3.x (2024-11-30)

**Problem**: Tests fail with "Connection refused" when running multiple test classes together, but pass individually.

**Root cause**: Using `@Testcontainers` + `@Container` on a static field creates a new container per test class. The `@ServiceConnection` annotation doesn't properly refresh with new container ports.

**Solution**: Use `@TestConfiguration` with `@Bean @ServiceConnection`:

```java
@TestConfiguration(proxyBeanMethods = false)
public class TestContainersConfiguration {
    @Bean
    @ServiceConnection
    public PostgreSQLContainer<?> postgresContainer() {
        return new PostgreSQLContainer<>("postgres:17-alpine");
    }
}
```

Then `@Import(TestContainersConfiguration.class)` in your base test class.

**Sources**:
- [Spring Boot Testcontainers Docs](https://docs.spring.io/spring-boot/reference/testing/testcontainers.html)
- [Stack Overflow: @ServiceConnection issue](https://stackoverflow.com/questions/78514392/issue-with-testcontainers-serviceconnection-in-abstractintegrationtest-when-run)

---

## PMD Rule Categories (2024-11-30)

Rules aren't always in the category you'd expect:

| Rule | Actual Category | Not in |
|------|-----------------|--------|
| `AvoidDuplicateLiterals` | `errorprone` | bestpractices |
| `RedundantFieldInitializer` | `performance` | codestyle |
| `TestClassWithoutTestCases` | `errorprone` | bestpractices |

If PMD warns "Exclude pattern did not match any rule in ruleset", the rule is in a different category.

---

## SpotBugs + JPA Entities (2024-11-30)

**Problem**: SpotBugs reports `EI_EXPOSE_REP` and `EI_EXPOSE_REP2` on JPA entity getters/setters.

**Why it's a false positive**: JPA requires mutable entity relationships. Defensive copies would break JPA's change tracking.

**Solution**: Create `config/spotbugs/exclusions.xml`:

```xml
<FindBugsFilter>
    <Match>
        <Bug pattern="EI_EXPOSE_REP,EI_EXPOSE_REP2"/>
    </Match>
</FindBugsFilter>
```
