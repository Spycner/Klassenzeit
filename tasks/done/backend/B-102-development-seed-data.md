# B-102: Development Seed Data

## Description
Create Flyway migration with sample data for local development.

## Completion Notes

### File Created
`backend/src/main/resources/db/seed/V100__seed_dev_data.sql`

### Seed Data Contents
- One sample school ("Demo Grundschule")
- One school year (2024/2025) with two terms
- 5-10 sample teachers with qualifications
- Standard subjects (Deutsch, Mathematik, Sachunterricht, Sport, Kunst, Musik, Religion/Ethik)
- Sample rooms (Klassenräume, Turnhalle, Musikraum)
- Sample school classes (1a, 1b, 2a, 2b, 3a, 3b, 4a, 4b)
- Time slot grid (Monday-Friday, periods 1-6)
- Teacher availability (blocked/preferred time slots for part-time teachers)

### Implementation Details
Seed data is in a separate `db/seed/` folder and only loaded in dev profile via Flyway locations config.
