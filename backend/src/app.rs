use crate::controllers;
use crate::keycloak::initializer::KeycloakInitializer;
use crate::services::scheduler as scheduler_service;
use crate::workers::scheduler::SchedulerWorker;
use async_trait::async_trait;
use loco_rs::{
    app::{AppContext, Hooks, Initializer},
    bgworker::{BackgroundWorker, Queue},
    boot::{create_app, BootResult, StartMode},
    config::Config,
    controller::AppRoutes,
    db::truncate_table,
    environment::Environment,
    Result,
};
use migration::Migrator;
use std::path::Path;

use crate::models::_entities::{app_users, school_memberships, schools};

pub struct App;
#[async_trait]
impl Hooks for App {
    fn app_name() -> &'static str {
        env!("CARGO_CRATE_NAME")
    }

    fn app_version() -> String {
        format!(
            "{} ({})",
            env!("CARGO_PKG_VERSION"),
            option_env!("BUILD_SHA")
                .or(option_env!("GITHUB_SHA"))
                .unwrap_or("dev")
        )
    }

    async fn boot(
        mode: StartMode,
        environment: &Environment,
        config: Config,
    ) -> Result<BootResult> {
        create_app::<Self, Migrator>(mode, environment, config).await
    }

    async fn after_context(ctx: AppContext) -> Result<AppContext> {
        ctx.shared_store
            .insert(scheduler_service::new_scheduler_state());
        Ok(ctx)
    }

    async fn initializers(_ctx: &AppContext) -> Result<Vec<Box<dyn Initializer>>> {
        Ok(vec![Box::new(KeycloakInitializer)])
    }

    fn routes(_ctx: &AppContext) -> AppRoutes {
        AppRoutes::with_default_routes()
            .add_route(controllers::auth::routes())
            .add_route(controllers::schools::routes())
            .add_route(controllers::members::routes())
            .add_route(controllers::curriculum::routes())
            .add_route(controllers::scheduler::routes())
            .add_route(controllers::school_years::routes())
            .add_route(controllers::terms::routes())
            .add_route(controllers::classes::routes())
            .add_route(controllers::subjects::routes())
            .add_route(controllers::teachers::routes())
            .add_route(controllers::rooms::routes())
            .add_route(controllers::room_timeslot_capacities::routes())
            .add_route(controllers::time_slots::routes())
    }

    async fn connect_workers(ctx: &AppContext, queue: &Queue) -> Result<()> {
        queue.register(SchedulerWorker::build(ctx)).await?;
        Ok(())
    }

    fn register_tasks(_tasks: &mut loco_rs::task::Tasks) {}

    async fn truncate(ctx: &AppContext) -> Result<()> {
        truncate_table(&ctx.db, school_memberships::Entity).await?;
        truncate_table(&ctx.db, app_users::Entity).await?;
        truncate_table(&ctx.db, schools::Entity).await?;
        Ok(())
    }

    async fn seed(_ctx: &AppContext, _base: &Path) -> Result<()> {
        Ok(())
    }
}
