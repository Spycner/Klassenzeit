# G-010: Configure Structured Logging

## Description
Set up structured logging for backend and error tracking for frontend.

## Acceptance Criteria

### Backend (Spring Boot)
- [ ] Configure logging levels in `application.yaml`
- [ ] Add structured JSON logging for production (logstash-logback-encoder)

### Frontend (React)
- [ ] Evaluate error tracking options (Sentry, LogRocket)
- [ ] Add error boundary for React errors
- [ ] Configure console logging for dev only

## Dependencies
None

## Blocks
None

## Notes
### Backend Configuration
```yaml
logging:
  level:
    com.klassenzeit: DEBUG
    org.hibernate.SQL: DEBUG  # see SQL queries (dev only)
```

### Production JSON Logging
```kotlin
implementation("net.logstash.logback:logstash-logback-encoder:7.4")
```

### Frontend (Sentry)
```bash
npm install @sentry/react
```
```typescript
// main.tsx
Sentry.init({ dsn: "...", environment: import.meta.env.MODE });
```
