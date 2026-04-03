#![allow(elided_lifetimes_in_paths)]
#![allow(clippy::wildcard_imports)]
pub use sea_orm_migration::prelude::*;
mod m20250403_000001_core_tables;
mod m20250403_000002_domain_tables;

pub struct Migrator;

#[async_trait::async_trait]
impl MigratorTrait for Migrator {
    fn migrations() -> Vec<Box<dyn MigrationTrait>> {
        vec![
            Box::new(m20250403_000001_core_tables::Migration),
            Box::new(m20250403_000002_domain_tables::Migration),
            // inject-above (do not remove this comment)
        ]
    }
}
