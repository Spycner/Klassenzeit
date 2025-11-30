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
├── components/ui/   # shadcn/ui components
├── pages/           # Route page components
├── lib/utils.ts     # Utility functions (cn helper)
├── App.tsx          # Router setup
├── main.tsx         # Application entry point
└── index.css        # Tailwind styles + CSS variables
```

## Path Aliases

Use `@/` to import from `src/`:
```typescript
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
```
