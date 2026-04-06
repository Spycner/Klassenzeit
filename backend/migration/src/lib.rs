#![allow(elided_lifetimes_in_paths)]
#![allow(clippy::wildcard_imports)]
pub use sea_orm_migration::prelude::*;
mod m20250403_000001_core_tables;
mod m20250403_000002_domain_tables;
mod m20250403_000003_curriculum_entries;
pub mod m20250405_000001_room_capacity;
pub mod m20250406_000001_scheduler_settings;

pub struct Migrator;

#[async_trait::async_trait]
impl MigratorTrait for Migrator {
    fn migrations() -> Vec<Box<dyn MigrationTrait>> {
        vec![
            Box::new(m20250403_000001_core_tables::Migration),
            Box::new(m20250403_000002_domain_tables::Migration),
            Box::new(m20250403_000003_curriculum_entries::Migration),
            Box::new(m20250405_000001_room_capacity::Migration),
            Box::new(m20250406_000001_scheduler_settings::Migration),
            // inject-above (do not remove this comment)
        ]
    }
}
