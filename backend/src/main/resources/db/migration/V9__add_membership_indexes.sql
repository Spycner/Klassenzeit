-- Composite index for membership queries (findAllBySchool, countBySchoolIdAndRoleAndActiveTrue)
CREATE INDEX idx_school_membership_school_role_active
ON school_membership(school_id, role, is_active)
WHERE is_active = true;
