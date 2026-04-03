use chrono::Utc;
use loco_rs::prelude::*;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::services::scheduler::{self, SchedulerState, SolveJob, SolveStatus};

pub struct SchedulerWorker {
    pub ctx: AppContext,
}

#[derive(Deserialize, Debug, Serialize)]
pub struct SchedulerWorkerArgs {
    pub term_id: Uuid,
    pub school_id: Uuid,
}

#[async_trait]
impl BackgroundWorker<SchedulerWorkerArgs> for SchedulerWorker {
    fn build(ctx: &AppContext) -> Self {
        Self { ctx: ctx.clone() }
    }

    async fn perform(&self, args: SchedulerWorkerArgs) -> Result<()> {
        let state: SchedulerState = self
            .ctx
            .shared_store
            .get_ref::<SchedulerState>()
            .ok_or_else(|| loco_rs::Error::string("Scheduler state not found in shared store"))?
            .clone();

        // Mark as solving
        state.insert(
            args.term_id,
            SolveJob {
                status: SolveStatus::Solving,
                started_at: Utc::now(),
                completed_at: None,
                result: None,
                error: None,
            },
        );

        // Load data and solve
        match scheduler::load_schedule_input(&self.ctx.db, args.school_id, args.term_id).await {
            Ok(input) => {
                let output = klassenzeit_scheduler::solve(input);
                let result = scheduler::to_solve_result(output);

                state.alter(&args.term_id, |_, mut job| {
                    job.status = SolveStatus::Solved;
                    job.completed_at = Some(Utc::now());
                    job.result = Some(result);
                    job
                });
            }
            Err(e) => {
                state.alter(&args.term_id, |_, mut job| {
                    job.status = SolveStatus::Failed;
                    job.completed_at = Some(Utc::now());
                    job.error = Some(e.to_string());
                    job
                });
            }
        }

        Ok(())
    }
}
