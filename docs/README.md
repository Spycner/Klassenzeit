# Klassenzeit docs

This directory contains every piece of documentation that lives in the
repo. It is organized into three orthogonal trees, each answering a
different question:

- **`architecture/`** — living reference for current system state.
  *Populated.* Updated alongside the code. Start here to understand
  the codebase as it is today.
- **`adr/`** — immutable Architecture Decision Records. *Populated.*
  Go here to find *why* something is the way it is. ADRs are never
  edited; they are superseded by new ADRs.
- **`superpowers/`** — design specs, implementation plans, and open
  questions from the spec-driven workflow. *Populated.* Historical
  record of "what did we agree to build on day D" — useful for
  context, not as a description of current state.

Three more slots exist conceptually but are not yet populated. When
one becomes real, create its directory and delete its "not yet" bullet
here:

- **`tutorials/`** — step-by-step learning paths. *Not yet.* Will
  live at `docs/tutorials/` once onboarding outgrows the README.
- **`how-to/`** — task-oriented recipes ("how do I add a new route").
  *Not yet.* Will live at `docs/how-to/` once the architecture docs
  stop being able to cover everything inline.
- **`reference/`** — auto-generated API docs. *Not yet.* Will live at
  `docs/reference/` once there is a stable public API worth
  documenting.
- **`runbooks/`** — incident response and on-call playbooks.
  *Not yet.* Will live at `docs/runbooks/` once there is a production
  deployment.

## Rules

1. Write an ADR when making a decision that is load-bearing and not
   obvious from reading the code.
2. Update `architecture/<subsystem>.md` when the subsystem lands or
   changes shape.
3. Specs and plans stay under `superpowers/` — they are the *process*,
   not the *product* documentation.
