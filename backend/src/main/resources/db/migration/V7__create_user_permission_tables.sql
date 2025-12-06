-- User and permission tables for Keycloak integration
-- Keycloak handles identity (login, passwords), this handles authorization (school access)

-- app_user: Links Keycloak identity to application
CREATE TABLE app_user (
    id UUID PRIMARY KEY,
    keycloak_id VARCHAR(255) NOT NULL UNIQUE,
    email VARCHAR(255) NOT NULL UNIQUE,
    display_name VARCHAR(255) NOT NULL,
    is_platform_admin BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    version BIGINT NOT NULL DEFAULT 0
);

CREATE INDEX idx_app_user_keycloak_id ON app_user(keycloak_id);
CREATE INDEX idx_app_user_email ON app_user(email);

-- Enum for school roles
CREATE TYPE school_role AS ENUM ('SCHOOL_ADMIN', 'PLANNER', 'TEACHER', 'VIEWER');

-- school_membership: User roles per school (many-to-many)
CREATE TABLE school_membership (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    school_id UUID NOT NULL REFERENCES school(id) ON DELETE CASCADE,
    role school_role NOT NULL,
    linked_teacher_id UUID REFERENCES teacher(id) ON DELETE SET NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    granted_by UUID REFERENCES app_user(id),
    granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    version BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT uq_school_membership UNIQUE (user_id, school_id)
);

CREATE INDEX idx_school_membership_user ON school_membership(user_id);
CREATE INDEX idx_school_membership_school ON school_membership(school_id);
CREATE INDEX idx_school_membership_teacher ON school_membership(linked_teacher_id);

-- Enum for access request status
CREATE TYPE access_request_status AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- school_access_request: Users request to join schools
CREATE TABLE school_access_request (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    school_id UUID NOT NULL REFERENCES school(id) ON DELETE CASCADE,
    requested_role school_role NOT NULL DEFAULT 'VIEWER',
    status access_request_status NOT NULL DEFAULT 'PENDING',
    message TEXT,
    response_message TEXT,
    reviewed_by UUID REFERENCES app_user(id),
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    version BIGINT NOT NULL DEFAULT 0
);

CREATE INDEX idx_access_request_user ON school_access_request(user_id);
CREATE INDEX idx_access_request_school ON school_access_request(school_id);
CREATE INDEX idx_access_request_status ON school_access_request(school_id, status);

-- Enum for invitation status
CREATE TYPE invitation_status AS ENUM ('PENDING', 'ACCEPTED', 'EXPIRED', 'CANCELLED');

-- school_invitation: Placeholder for future email/link invitations
CREATE TABLE school_invitation (
    id UUID PRIMARY KEY,
    school_id UUID NOT NULL REFERENCES school(id) ON DELETE CASCADE,
    email VARCHAR(255),
    token VARCHAR(255) NOT NULL UNIQUE,
    role school_role NOT NULL DEFAULT 'VIEWER',
    status invitation_status NOT NULL DEFAULT 'PENDING',
    expires_at TIMESTAMPTZ NOT NULL,
    max_uses INTEGER DEFAULT 1,
    use_count INTEGER NOT NULL DEFAULT 0,
    created_by UUID NOT NULL REFERENCES app_user(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    version BIGINT NOT NULL DEFAULT 0
);

CREATE INDEX idx_invitation_token ON school_invitation(token);
CREATE INDEX idx_invitation_school ON school_invitation(school_id);
CREATE INDEX idx_invitation_email ON school_invitation(email) WHERE email IS NOT NULL;
