use klassenzeit_scheduler::solve;
use klassenzeit_scheduler::types::{ScheduleInput, ScheduleOutput};

#[test]
fn empty_input_returns_empty_timetable() {
    let input = ScheduleInput::default();
    let output = solve(input);
    assert!(output.timetable.is_empty());
    assert!(output.violations.is_empty());
}
