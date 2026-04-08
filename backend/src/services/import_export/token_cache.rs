//! In-memory cache for preview tokens.
//!
//! Per-school capacity is bounded; entries expire after a TTL.

use crate::services::import_export::EntityKind;
use chrono::{DateTime, Duration, Utc};
use dashmap::DashMap;
use std::sync::Arc;
use uuid::Uuid;

const TTL_SECONDS: i64 = 600;
const MAX_PER_SCHOOL: usize = 100;

#[derive(Clone, Debug)]
pub struct PreviewCacheEntry {
    pub school_id: Uuid,
    pub entity: EntityKind,
    pub payload: serde_json::Value,
    pub created_at: DateTime<Utc>,
}

#[derive(Clone, Default)]
pub struct PreviewTokenCache {
    inner: Arc<DashMap<Uuid, PreviewCacheEntry>>,
}

impl PreviewTokenCache {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn insert(&self, school_id: Uuid, entity: EntityKind, payload: serde_json::Value) -> Uuid {
        self.evict_expired();
        self.evict_oldest_for_school(school_id);
        let token = Uuid::new_v4();
        self.inner.insert(
            token,
            PreviewCacheEntry {
                school_id,
                entity,
                payload,
                created_at: Utc::now(),
            },
        );
        token
    }

    pub fn take(
        &self,
        token: Uuid,
        school_id: Uuid,
        entity: EntityKind,
    ) -> Option<PreviewCacheEntry> {
        let entry = self.inner.remove(&token).map(|(_, v)| v)?;
        if entry.school_id != school_id || entry.entity != entity {
            // Wrong tenant or entity — re-insert (don't consume) and return None.
            self.inner.insert(token, entry);
            return None;
        }
        if Utc::now() - entry.created_at > Duration::seconds(TTL_SECONDS) {
            return None;
        }
        Some(entry)
    }

    pub fn peek(&self, token: Uuid) -> Option<PreviewCacheEntry> {
        self.inner.get(&token).map(|e| e.clone())
    }

    fn evict_expired(&self) {
        let now = Utc::now();
        let cutoff = Duration::seconds(TTL_SECONDS);
        self.inner.retain(|_, e| now - e.created_at <= cutoff);
    }

    fn evict_oldest_for_school(&self, school_id: Uuid) {
        let mut for_school: Vec<(Uuid, DateTime<Utc>)> = self
            .inner
            .iter()
            .filter(|e| e.school_id == school_id)
            .map(|e| (*e.key(), e.created_at))
            .collect();
        if for_school.len() < MAX_PER_SCHOOL {
            return;
        }
        for_school.sort_by_key(|(_, t)| *t);
        let to_drop = for_school.len() - MAX_PER_SCHOOL + 1;
        for (token, _) in for_school.into_iter().take(to_drop) {
            self.inner.remove(&token);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn insert_and_take_round_trip() {
        let cache = PreviewTokenCache::new();
        let school = Uuid::new_v4();
        let token = cache.insert(school, EntityKind::Teachers, serde_json::json!({"x": 1}));
        let entry = cache.take(token, school, EntityKind::Teachers).unwrap();
        assert_eq!(entry.payload, serde_json::json!({"x": 1}));
        // Token consumed.
        assert!(cache.take(token, school, EntityKind::Teachers).is_none());
    }

    #[test]
    fn take_with_wrong_school_returns_none_and_does_not_consume() {
        let cache = PreviewTokenCache::new();
        let school_a = Uuid::new_v4();
        let school_b = Uuid::new_v4();
        let token = cache.insert(school_a, EntityKind::Teachers, serde_json::json!({}));
        assert!(cache.take(token, school_b, EntityKind::Teachers).is_none());
        // Original owner can still consume.
        assert!(cache.take(token, school_a, EntityKind::Teachers).is_some());
    }

    #[test]
    fn take_with_wrong_entity_returns_none_and_does_not_consume() {
        let cache = PreviewTokenCache::new();
        let school = Uuid::new_v4();
        let token = cache.insert(school, EntityKind::Teachers, serde_json::json!({}));
        assert!(cache.take(token, school, EntityKind::Rooms).is_none());
        assert!(cache.take(token, school, EntityKind::Teachers).is_some());
    }

    #[test]
    fn per_school_bound_evicts_oldest() {
        let cache = PreviewTokenCache::new();
        let school = Uuid::new_v4();
        let mut tokens = Vec::new();
        for _ in 0..MAX_PER_SCHOOL + 5 {
            tokens.push(cache.insert(school, EntityKind::Teachers, serde_json::json!({})));
        }
        // The oldest 5 should be gone.
        let mut surviving = 0;
        for t in &tokens {
            if cache.peek(*t).is_some() {
                surviving += 1;
            }
        }
        assert_eq!(surviving, MAX_PER_SCHOOL);
    }
}
