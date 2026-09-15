CREATE TABLE mcp_oauth_configs (
 server_id uuid PRIMARY KEY REFERENCES mcp_servers(id) ON DELETE CASCADE,
 client_id text, encrypted_client_secret text, scopes text NOT NULL DEFAULT '',
 dynamic_registration boolean NOT NULL DEFAULT false, revision uuid NOT NULL DEFAULT gen_random_uuid()
);
CREATE TABLE mcp_oauth_credentials (
 server_id uuid NOT NULL REFERENCES mcp_oauth_configs(server_id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
 encrypted_data text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(server_id,user_id)
);
CREATE TABLE mcp_oauth_attempts (
 state_hash text PRIMARY KEY, server_id uuid NOT NULL REFERENCES mcp_oauth_configs(server_id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
 workspace_id uuid NOT NULL, encrypted_data text NOT NULL, expires_at timestamptz NOT NULL
);
CREATE INDEX mcp_oauth_attempts_expiry ON mcp_oauth_attempts(expires_at);
-- Keep legacy definitions for audit/removal, but never execute or re-enable stdio.
UPDATE mcp_servers SET enabled = false, health_status = 'unsupported' WHERE transport = 'stdio';
ALTER TABLE mcp_servers ADD CONSTRAINT mcp_stdio_disabled CHECK (transport <> 'stdio' OR enabled = false);
CREATE TABLE mcp_sync_state (
 server_id uuid PRIMARY KEY REFERENCES mcp_servers(id) ON DELETE CASCADE,
 next_sync_at timestamptz NOT NULL DEFAULT now(), last_success_at timestamptz,
 failures integer NOT NULL DEFAULT 0, last_error text
);
CREATE INDEX mcp_sync_due ON mcp_sync_state(next_sync_at);
ALTER TABLE mcp_sync_state ADD COLUMN lease_id uuid, ADD COLUMN lease_until timestamptz;
