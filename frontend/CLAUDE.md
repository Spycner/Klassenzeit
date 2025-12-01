# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@../CLAUDE.md

## Project Overview

Klassenzeit is a timetabler application for schools. This is the frontend component built with React 19, Vite, TypeScript, Tailwind CSS, and shadcn/ui.

## Build Commands

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview

# Linting and formatting (Biome)
npm run lint        # Check for linting issues
npm run format      # Auto-format files
npm run check       # Lint + format check

# Type checking
npm run typecheck   # Run tsc --noEmit

# Add shadcn components
npx shadcn@latest add <component-name>
```

## Architecture

- **Framework**: React 19 with Vite 7
- **Language**: TypeScript
- **Styling**: Tailwind CSS v3 with shadcn/ui (New York style)
- **Routing**: React Router v7
- **Entry Point**: `src/main.tsx`
- **Configuration**: `vite.config.ts`, `tailwind.config.js`

## Project Structure

```
src/
├── api/             # API client, types, services, and React Query hooks
├── components/ui/   # shadcn/ui components
├── i18n/            # Internationalization config and translations
├── pages/           # Route page components
├── lib/utils.ts     # Utility functions (cn helper)
├── App.tsx          # Router setup
├── main.tsx         # Application entry point
└── index.css        # Tailwind styles + CSS variables
```

## Internationalization (i18n)

- **Library**: react-i18next
- **Languages**: German (default), English
- **Routing**: URL-prefixed (`/de/`, `/en/`)
- **Translations**: `src/i18n/locales/{de,en}/*.json`
- **Usage**: `const { t } = useTranslation('namespace')`

## API Integration

```bash
npm run generate-api   # Generate types from OpenAPI (requires backend running)
```

- **Location**: `src/api/` - Types, services, and React Query hooks
- **Type Generation**: Uses Orval to generate TypeScript types from backend OpenAPI spec
- **Usage**: Import hooks from `@/api` (e.g., `useSchools`, `useCreateTeacher`)

Run `generate-api` when backend API changes to keep frontend types in sync.

## Path Aliases

Use `@/` to import from `src/`:
```typescript
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
```

## Testing

### Commands
```bash
npm run test            # Run tests once
npm run test:watch      # Run tests in watch mode
npm run test:coverage   # Run tests with coverage report
npm run test:ui         # Open Vitest UI
```

### Test File Conventions
- Test files are co-located with source files: `Component.tsx` -> `Component.test.tsx`
- Use `*.test.ts` or `*.test.tsx` extension
- Tests live in `src/` alongside the code they test

### Test Setup
- Framework: Vitest + React Testing Library
- DOM Environment: jsdom
- Setup file: `src/test/setup.ts`

### Writing Tests
```typescript
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Button } from "./button";

describe("Button", () => {
  it("renders children correctly", () => {
    render(<Button>Click me</Button>);
    expect(screen.getByRole("button", { name: /click me/i })).toBeInTheDocument();
  });
});
```
