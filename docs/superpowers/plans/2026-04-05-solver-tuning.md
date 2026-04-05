# Solver Tuning (LAHC + Tabu Hybrid) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Tabu component to the LAHC solver to break the soft score plateau, and extend the benchmark binary with parameter sweep flags.

**Architecture:** The Tabu list is a lightweight `VecDeque` overlay on the existing LAHC loop. Moves that would reverse a recent action are rejected unless they produce a new global best (aspiration). The benchmark binary gets `--tabu-tenure` and `--list-length` CLI flags for parameter sweeps.

**Tech Stack:** Rust, existing scheduler crate infrastructure

---

### Task 1: TabuEntry type and tabu list helpers

**Files:**
- Modify: `scheduler/src/local_search.rs:29-39`
- Test: `scheduler/tests/local_search.rs`

- [ ] **Step 1: Write the failing test for tabu list behavior**

Add to `scheduler/tests/local_search.rs`:

```rust
use klassenzeit_scheduler::local_search::{TabuEntry, TabuList};

#[test]
fn tabu_list_rejects_forbidden_change_move() {
    let mut tabu = TabuList::new(3);
    // Record that lesson 5 was moved away from (timeslot=2, room=None)
    tabu.push(TabuEntry::Change {
        lesson_idx: 5,
        target_timeslot: 2,
        target_room: None,
    });
    // Moving lesson 5 back to (2, None) should be tabu
    assert!(tabu.is_tabu(&TabuEntry::Change {
        lesson_idx: 5,
        target_timeslot: 2,
        target_room: None,
    }));
    // Moving lesson 5 to (3, None) is not tabu
    assert!(!tabu.is_tabu(&TabuEntry::Change {
        lesson_idx: 5,
        target_timeslot: 3,
        target_room: None,
    }));
    // Moving a different lesson to (2, None) is not tabu
    assert!(!tabu.is_tabu(&TabuEntry::Change {
        lesson_idx: 7,
        target_timeslot: 2,
        target_room: None,
    }));
}

#[test]
fn tabu_list_rejects_forbidden_swap_move() {
    let mut tabu = TabuList::new(3);
    tabu.push(TabuEntry::Swap { idx_a: 2, idx_b: 5 });
    // Same pair (either order) is tabu
    assert!(tabu.is_tabu(&TabuEntry::Swap { idx_a: 2, idx_b: 5 }));
    assert!(tabu.is_tabu(&TabuEntry::Swap { idx_a: 5, idx_b: 2 }));
    // Different pair is not tabu
    assert!(!tabu.is_tabu(&TabuEntry::Swap { idx_a: 2, idx_b: 6 }));
}

#[test]
fn tabu_list_evicts_oldest_entry() {
    let mut tabu = TabuList::new(2); // capacity 2
    tabu.push(TabuEntry::Change {
        lesson_idx: 0,
        target_timeslot: 1,
        target_room: None,
    });
    tabu.push(TabuEntry::Change {
        lesson_idx: 1,
        target_timeslot: 2,
        target_room: None,
    });
    // Both are tabu
    assert!(tabu.is_tabu(&TabuEntry::Change {
        lesson_idx: 0,
        target_timeslot: 1,
        target_room: None,
    }));
    // Push a third — first entry should be evicted
    tabu.push(TabuEntry::Change {
        lesson_idx: 2,
        target_timeslot: 3,
        target_room: None,
    });
    // First entry no longer tabu
    assert!(!tabu.is_tabu(&TabuEntry::Change {
        lesson_idx: 0,
        target_timeslot: 1,
        target_room: None,
    }));
    // Third entry is tabu
    assert!(tabu.is_tabu(&TabuEntry::Change {
        lesson_idx: 2,
        target_timeslot: 3,
        target_room: None,
    }));
}

#[test]
fn tabu_list_zero_tenure_allows_everything() {
    let mut tabu = TabuList::new(0);
    tabu.push(TabuEntry::Change {
        lesson_idx: 0,
        target_timeslot: 1,
        target_room: None,
    });
    assert!(!tabu.is_tabu(&TabuEntry::Change {
        lesson_idx: 0,
        target_timeslot: 1,
        target_room: None,
    }));
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cargo test -p klassenzeit-scheduler --test local_search -- tabu 2>&1`
Expected: compilation error — `TabuEntry` and `TabuList` don't exist

- [ ] **Step 3: Implement TabuEntry and TabuList**

In `scheduler/src/local_search.rs`, add after the existing imports (line 7):

```rust
use std::collections::VecDeque;
```

Add after the `LahcConfig` struct (after line 27), before the existing `UndoInfo` enum:

```rust
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TabuEntry {
    Change {
        lesson_idx: usize,
        target_timeslot: usize,
        target_room: Option<usize>,
    },
    Swap {
        idx_a: usize,
        idx_b: usize,
    },
}

pub struct TabuList {
    entries: VecDeque<TabuEntry>,
    capacity: usize,
}

impl TabuList {
    pub fn new(capacity: usize) -> Self {
        Self {
            entries: VecDeque::with_capacity(capacity),
            capacity,
        }
    }

    pub fn push(&mut self, entry: TabuEntry) {
        if self.capacity == 0 {
            return;
        }
        if self.entries.len() == self.capacity {
            self.entries.pop_front();
        }
        self.entries.push_back(entry);
    }

    pub fn is_tabu(&self, candidate: &TabuEntry) -> bool {
        self.entries.iter().any(|e| Self::matches(e, candidate))
    }

    fn matches(stored: &TabuEntry, candidate: &TabuEntry) -> bool {
        match (stored, candidate) {
            (
                TabuEntry::Change {
                    lesson_idx: l1,
                    target_timeslot: ts1,
                    target_room: r1,
                },
                TabuEntry::Change {
                    lesson_idx: l2,
                    target_timeslot: ts2,
                    target_room: r2,
                },
            ) => l1 == l2 && ts1 == ts2 && r1 == r2,
            (
                TabuEntry::Swap {
                    idx_a: a1,
                    idx_b: b1,
                },
                TabuEntry::Swap {
                    idx_a: a2,
                    idx_b: b2,
                },
            ) => {
                let (min1, max1) = if a1 <= b1 { (a1, b1) } else { (b1, a1) };
                let (min2, max2) = if a2 <= b2 { (a2, b2) } else { (b2, a2) };
                min1 == min2 && max1 == max2
            }
            _ => false,
        }
    }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cargo test -p klassenzeit-scheduler --test local_search -- tabu 2>&1`
Expected: all 4 tabu tests PASS

- [ ] **Step 5: Commit**

```bash
git add scheduler/src/local_search.rs scheduler/tests/local_search.rs
git commit -m "feat(scheduler): add TabuEntry and TabuList types with tests"
```

---

### Task 2: Add tabu_tenure to LahcConfig

**Files:**
- Modify: `scheduler/src/local_search.rs:9-27`

- [ ] **Step 1: Add `tabu_tenure` field to `LahcConfig`**

In `scheduler/src/local_search.rs`, add a field to the `LahcConfig` struct:

```rust
pub struct LahcConfig {
    pub list_length: usize,
    pub max_seconds: u64,
    pub max_idle_ms: u64,
    pub seed: Option<u64>,
    pub history_sample_interval: u64,
    pub tabu_tenure: usize,
}
```

Update the `Default` impl:

```rust
impl Default for LahcConfig {
    fn default() -> Self {
        Self {
            list_length: 500,
            max_seconds: 60,
            max_idle_ms: 30_000,
            seed: None,
            history_sample_interval: 1000,
            tabu_tenure: 7,
        }
    }
}
```

- [ ] **Step 2: Fix any compilation errors from existing code that constructs LahcConfig**

The benchmark binary at `scheduler/src/bin/benchmark.rs:87-93` uses `..LahcConfig::default()`, so it will pick up the new field automatically. Check for any other construction sites and ensure they compile.

Run: `cargo check -p klassenzeit-scheduler 2>&1`
Expected: compiles with no errors

- [ ] **Step 3: Commit**

```bash
git add scheduler/src/local_search.rs
git commit -m "feat(scheduler): add tabu_tenure config field (default 7)"
```

---

### Task 3: Integrate tabu into the LAHC solver loop

**Files:**
- Modify: `scheduler/src/local_search.rs:41-240` (the `optimize` function)

- [ ] **Step 1: Write a test that tabu improves solver diversity**

Add to `scheduler/tests/local_search.rs`:

```rust
use bitvec::prelude::*;
use klassenzeit_scheduler::constraints::IncrementalState;
use klassenzeit_scheduler::local_search::{optimize, LahcConfig};
use klassenzeit_scheduler::planning::*;

#[test]
fn tabu_enabled_does_not_regress_vs_disabled() {
    // Use realistic instance for meaningful comparison
    let input = klassenzeit_scheduler::instances::small_4_classes();
    let config_no_tabu = LahcConfig {
        max_seconds: 5,
        max_idle_ms: 5000,
        seed: Some(42),
        tabu_tenure: 0,
        ..LahcConfig::default()
    };
    let config_with_tabu = LahcConfig {
        max_seconds: 5,
        max_idle_ms: 5000,
        seed: Some(42),
        tabu_tenure: 7,
        ..LahcConfig::default()
    };

    let output_no_tabu = klassenzeit_scheduler::solve_with_config(input.clone(), config_no_tabu);
    let output_with_tabu = klassenzeit_scheduler::solve_with_config(input, config_with_tabu);

    // Tabu should not make things worse — soft score should be >= (less negative)
    assert!(
        output_with_tabu.score.soft_score >= output_no_tabu.score.soft_score,
        "tabu regressed: {} vs {} (no tabu)",
        output_with_tabu.score.soft_score,
        output_no_tabu.score.soft_score,
    );
}
```

- [ ] **Step 2: Run test to verify it fails (or passes trivially — both configs produce same score currently since tabu isn't wired in)**

Run: `cargo test -p klassenzeit-scheduler --test local_search -- tabu_enabled 2>&1`
Expected: compiles and passes (both paths produce the same result since tabu logic isn't wired in yet)

- [ ] **Step 3: Wire tabu into the optimize function**

In `scheduler/src/local_search.rs`, modify the `optimize` function. After the `best_lessons` line (around line 84), add tabu list initialization:

```rust
    let mut tabu = TabuList::new(config.tabu_tenure);
```

After generating the move and computing `undo` but before the acceptance check (after line 171, before line 173), add tabu check logic. Replace the section from line 173 to line 214 with:

```rust
        let new_score = state.score();

        // Build tabu entry for this move's target (what we just moved TO)
        let tabu_entry = match &undo {
            UndoInfo::Change {
                lesson_idx, ..
            } => TabuEntry::Change {
                lesson_idx: *lesson_idx,
                target_timeslot: lessons[*lesson_idx].timeslot.unwrap(),
                target_room: lessons[*lesson_idx].room,
            },
            UndoInfo::Swap { idx_a, idx_b } => TabuEntry::Swap {
                idx_a: *idx_a,
                idx_b: *idx_b,
            },
        };

        // Check if this move's reverse (returning to where we came from) is tabu
        let reverse_entry = match &undo {
            UndoInfo::Change {
                lesson_idx,
                old_timeslot,
                old_room,
            } => TabuEntry::Change {
                lesson_idx: *lesson_idx,
                target_timeslot: *old_timeslot,
                target_room: *old_room,
            },
            UndoInfo::Swap { idx_a, idx_b } => TabuEntry::Swap {
                idx_a: *idx_a,
                idx_b: *idx_b,
            },
        };

        let is_tabu = tabu.is_tabu(&reverse_entry);
        let is_new_best = new_score > best_score;

        // Tabu rejection: if the move is tabu and not a new best, undo it
        if is_tabu && !is_new_best {
            match undo {
                UndoInfo::Change {
                    lesson_idx,
                    old_timeslot,
                    old_room,
                } => {
                    state.unassign(&mut lessons[lesson_idx], facts);
                    state.assign(&mut lessons[lesson_idx], old_timeslot, old_room, facts);
                }
                UndoInfo::Swap { idx_a, idx_b } => {
                    let ts_a = lessons[idx_a].timeslot.unwrap();
                    let room_a = lessons[idx_a].room;
                    let ts_b = lessons[idx_b].timeslot.unwrap();
                    let room_b = lessons[idx_b].room;

                    state.unassign(&mut lessons[idx_a], facts);
                    state.unassign(&mut lessons[idx_b], facts);
                    state.assign(&mut lessons[idx_a], ts_b, room_b, facts);
                    state.assign(&mut lessons[idx_b], ts_a, room_a, facts);
                }
            }
            stats.moves_rejected += 1;
            continue;
        }

        let list_idx = (iteration as usize) % config.list_length;
        let list_score = fitness_list[list_idx];

        // LAHC acceptance (or aspiration override)
        if is_new_best || new_score >= list_score || new_score >= current_score {
            // Accept
            current_score = new_score;
            stats.moves_accepted += 1;
            tabu.push(tabu_entry);

            if is_new_best {
                best_score = new_score;
                best_lessons = lessons.to_vec();
                stats.best_found_at_iteration = iteration;
                last_improvement = Instant::now();
            }
        } else {
            // Reject — undo
            match undo {
                UndoInfo::Change {
                    lesson_idx,
                    old_timeslot,
                    old_room,
                } => {
                    state.unassign(&mut lessons[lesson_idx], facts);
                    state.assign(&mut lessons[lesson_idx], old_timeslot, old_room, facts);
                }
                UndoInfo::Swap { idx_a, idx_b } => {
                    let ts_a = lessons[idx_a].timeslot.unwrap();
                    let room_a = lessons[idx_a].room;
                    let ts_b = lessons[idx_b].timeslot.unwrap();
                    let room_b = lessons[idx_b].room;

                    state.unassign(&mut lessons[idx_a], facts);
                    state.unassign(&mut lessons[idx_b], facts);
                    state.assign(&mut lessons[idx_a], ts_b, room_b, facts);
                    state.assign(&mut lessons[idx_b], ts_a, room_a, facts);
                }
            }
            stats.moves_rejected += 1;
        }
```

Note: The `tabu_entry` records where the lesson moved TO. The `reverse_entry` records where it came FROM (via the undo info). We check `reverse_entry` against the tabu list because: after a move, the tabu list should forbid immediately reversing back. So we record the forward move's target as tabu for future checks. Wait — let me clarify the logic:

Actually, the correct approach: When we execute move M (e.g., move lesson L from slot A to slot B), we want to forbid the reverse (moving L from B back to A) for the next `tenure` iterations. So we record `TabuEntry::Change { lesson_idx: L, target_timeslot: A, target_room: ... }` — the entry says "moving lesson L to slot A is forbidden." Before executing a candidate move, we check if the candidate's target matches any tabu entry.

So the check should be: build a `TabuEntry` representing "where this candidate move would place the lesson" and check if that's tabu. If the candidate is "move lesson L to slot X, room Y", check `TabuEntry::Change { lesson_idx: L, target_timeslot: X, target_room: Y }`.

The recording after accepting: record `TabuEntry::Change { lesson_idx: L, target_timeslot: old_slot, target_room: old_room }` — forbid going back to where it was.

Let me correct the implementation in the actual step. The code above needs adjustment — the `tabu_entry` should use the OLD position (from undo info), and the check should use the NEW position (current assignment). Actually, re-reading: the check should be done BEFORE executing the move, but we need to know the target. For a Change move, the target is `(new_timeslot, new_room)`. We can check before executing.

Let me restructure: check tabu BEFORE executing the move, not after. This avoids the cost of executing and undoing tabu moves.

Corrected approach in Step 3:

Before executing the move (right after computing `new_timeslot`/`new_room` for Change, or `idx_a`/`idx_b` for Swap), build the candidate tabu entry and check. If tabu and current best wouldn't improve, skip (continue). If not tabu, execute the move normally.

After accepting the move, record the OLD position as tabu (forbid returning).

- [ ] **Step 4: Run all scheduler tests**

Run: `cargo test -p klassenzeit-scheduler 2>&1`
Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add scheduler/src/local_search.rs scheduler/tests/local_search.rs
git commit -m "feat(scheduler): integrate tabu into LAHC solver loop"
```

---

### Task 4: Extend benchmark binary with parameter sweep flags

**Files:**
- Modify: `scheduler/src/bin/benchmark.rs`

- [ ] **Step 1: Add CLI flags to the Args struct**

In `scheduler/src/bin/benchmark.rs`, add to the `Args` struct:

```rust
#[derive(Parser)]
#[command(
    name = "benchmark",
    about = "Run solver benchmarks across test instances"
)]
struct Args {
    /// Number of seeds per instance
    #[arg(long, default_value_t = 10)]
    seeds: u64,

    /// Max seconds per solve
    #[arg(long, default_value_t = 30)]
    max_seconds: u64,

    /// LAHC fitness list length
    #[arg(long, default_value_t = 500)]
    list_length: usize,

    /// Tabu tenure (0 to disable)
    #[arg(long, default_value_t = 7)]
    tabu_tenure: usize,

    /// Output JSON to stdout instead of table to stderr
    #[arg(long)]
    json: bool,
}
```

- [ ] **Step 2: Wire the new flags into config construction**

In the `main` function, update the `LahcConfig` construction (around line 87):

```rust
            let config = LahcConfig {
                list_length: args.list_length,
                max_seconds: args.max_seconds,
                max_idle_ms: args.max_seconds * 1000,
                seed: Some(seed),
                history_sample_interval: 100,
                tabu_tenure: args.tabu_tenure,
            };
```

- [ ] **Step 3: Add config summary to table output header**

After the table header line (around line 168), add a config summary:

```rust
    if !args.json {
        eprintln!();
        eprintln!(
            "Config: list_length={}, tabu_tenure={}, max_seconds={}",
            args.list_length, args.tabu_tenure, args.max_seconds
        );
        eprintln!();
        // ... existing header and rows ...
    }
```

- [ ] **Step 4: Verify it compiles and runs**

Run: `cargo run --release -p klassenzeit-scheduler --bin benchmark -- --seeds 1 --max-seconds 5 --tabu-tenure 7 --list-length 500 2>&1`
Expected: compiles and runs, prints config summary + table

- [ ] **Step 5: Commit**

```bash
git add scheduler/src/bin/benchmark.rs
git commit -m "feat(scheduler): add --tabu-tenure and --list-length flags to benchmark"
```

---

### Task 5: Run parameter sweep and validate improvement

**Files:**
- No new code — this is a validation task

- [ ] **Step 1: Run baseline benchmark (tabu disabled)**

```bash
cargo run --release -p klassenzeit-scheduler --bin benchmark -- --seeds 10 --max-seconds 30 --tabu-tenure 0
```

Record the output (soft_avg, soft_best, soft_worst for each instance).

- [ ] **Step 2: Run benchmark with default tabu (tenure=7)**

```bash
cargo run --release -p klassenzeit-scheduler --bin benchmark -- --seeds 10 --max-seconds 30 --tabu-tenure 7
```

Compare: soft scores should show variance > 0 and average improvement over baseline.

- [ ] **Step 3: Run sweep across tenure values**

```bash
for t in 5 7 10 15; do
  echo "=== tenure=$t ==="
  cargo run --release -p klassenzeit-scheduler --bin benchmark -- --seeds 10 --max-seconds 30 --tabu-tenure $t
done
```

- [ ] **Step 4: Run sweep across list_length values**

```bash
for l in 100 300 500 1000; do
  echo "=== list_length=$l ==="
  cargo run --release -p klassenzeit-scheduler --bin benchmark -- --seeds 10 --max-seconds 30 --list-length $l
done
```

- [ ] **Step 5: Update default values if sweep reveals better settings**

If a different `tabu_tenure` or `list_length` consistently outperforms the defaults, update the `Default` impl in `scheduler/src/local_search.rs`.

- [ ] **Step 6: Commit any default changes**

```bash
git add scheduler/src/local_search.rs
git commit -m "feat(scheduler): tune default solver parameters from sweep results"
```

---

### Task 6: Final validation and cleanup

**Files:**
- Modify: `docs/STATUS.md`
- Modify: `docs/superpowers/next-steps.md`

- [ ] **Step 1: Run full test suite**

```bash
cargo test --workspace 2>&1
```

Expected: all tests PASS

- [ ] **Step 2: Run clippy**

```bash
cargo clippy -p klassenzeit-scheduler -- -D warnings 2>&1
```

Expected: no warnings

- [ ] **Step 3: Update STATUS.md**

Update `docs/STATUS.md` — move "Solver Tuning" from "Next Up" to completed, set next step.

- [ ] **Step 4: Update next-steps.md**

In `docs/superpowers/next-steps.md`, mark item 1d+ as done with the PR number, and note the benchmark improvement.

- [ ] **Step 5: Commit docs**

```bash
git add docs/STATUS.md docs/superpowers/next-steps.md
git commit -m "docs: update status for solver tuning completion"
```
