CREATE TYPE agent_kind AS ENUM ('assistant', 'orchestrator');
CREATE TYPE agent_run_status AS ENUM (
  'queued',
  'running',
  'waiting_approval',
  'success',
  'failed',
  'cancelled',
  'timed_out'
);
CREATE TYPE agent_run_trigger AS ENUM (
  'chat',
  'scheduled',
  'api',
  'delegation',
  'dry_run'
);
CREATE TYPE agent_run_step_kind AS ENUM (
  'model',
  'tool',
  'delegation',
  'approval'
);
CREATE TYPE token_reservation_status AS ENUM (
  'active',
  'settled',
  'released',
  'expired'
);

ALTER TABLE agents
  ADD COLUMN kind agent_kind NOT NULL DEFAULT 'assistant';

ALTER TABLE agent_versions
  ADD COLUMN orchestration_policy_json jsonb;

CREATE UNIQUE INDEX agent_versions_id_agent_unique
  ON agent_versions (id, agent_id);

CREATE TABLE agent_delegation_bindings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_version_id uuid NOT NULL REFERENCES agent_versions(id) ON DELETE CASCADE,
  child_agent_id uuid NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  child_agent_version_id uuid NOT NULL,
  instructions text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agent_delegation_bindings_child_version_fk
    FOREIGN KEY (child_agent_version_id, child_agent_id)
    REFERENCES agent_versions(id, agent_id),
  CONSTRAINT agent_delegation_bindings_no_self
    CHECK (agent_version_id <> child_agent_version_id)
);

CREATE UNIQUE INDEX agent_delegation_bindings_version_child_unique
  ON agent_delegation_bindings (agent_version_id, child_agent_id);
CREATE INDEX agent_delegation_bindings_child_version
  ON agent_delegation_bindings (child_agent_version_id);

CREATE TABLE agent_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  agent_id uuid NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  agent_version_id uuid NOT NULL,
  root_run_id uuid NOT NULL,
  parent_run_id uuid,
  conversation_id uuid REFERENCES conversations(id) ON DELETE SET NULL,
  message_id uuid REFERENCES messages(id) ON DELETE SET NULL,
  scheduled_task_id uuid REFERENCES scheduled_tasks(id) ON DELETE SET NULL,
  trigger agent_run_trigger NOT NULL,
  status agent_run_status NOT NULL DEFAULT 'queued',
  actor_principal_type varchar(32) NOT NULL,
  actor_principal_id uuid NOT NULL,
  idempotency_key varchar(255),
  input_encrypted text NOT NULL,
  input_preview_json jsonb,
  output_encrypted text,
  output_preview_json jsonb,
  depth integer NOT NULL DEFAULT 0 CHECK (depth >= 0),
  delegation_count integer NOT NULL DEFAULT 0 CHECK (delegation_count >= 0),
  reserved_tokens integer NOT NULL DEFAULT 0 CHECK (reserved_tokens >= 0),
  input_tokens integer CHECK (input_tokens IS NULL OR input_tokens >= 0),
  output_tokens integer CHECK (output_tokens IS NULL OR output_tokens >= 0),
  deadline_at timestamptz NOT NULL,
  lease_owner varchar(255),
  lease_expires_at timestamptz,
  cancel_requested_at timestamptz,
  error_code varchar(64),
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agent_runs_agent_version_fk
    FOREIGN KEY (agent_version_id, agent_id)
    REFERENCES agent_versions(id, agent_id)
);

ALTER TABLE agent_runs
  ADD CONSTRAINT agent_runs_root_fk
  FOREIGN KEY (root_run_id) REFERENCES agent_runs(id) ON DELETE CASCADE
  DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE agent_runs
  ADD CONSTRAINT agent_runs_parent_fk
  FOREIGN KEY (parent_run_id) REFERENCES agent_runs(id) ON DELETE CASCADE;

CREATE INDEX agent_runs_workspace_created
  ON agent_runs (workspace_id, created_at);
CREATE INDEX agent_runs_parent
  ON agent_runs (parent_run_id, created_at);
CREATE INDEX agent_runs_status_lease
  ON agent_runs (status, lease_expires_at);
CREATE UNIQUE INDEX agent_runs_workspace_trigger_idempotency_unique
  ON agent_runs (workspace_id, trigger, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE TABLE agent_run_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
  sequence integer NOT NULL CHECK (sequence >= 0),
  kind agent_run_step_kind NOT NULL,
  status agent_run_status NOT NULL,
  name varchar(255),
  child_run_id uuid REFERENCES agent_runs(id) ON DELETE SET NULL,
  input_preview_json jsonb,
  output_preview_json jsonb,
  error_message text,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  CONSTRAINT agent_run_steps_run_sequence_unique UNIQUE (run_id, sequence)
);
CREATE INDEX agent_run_steps_child_run ON agent_run_steps (child_run_id);

CREATE TABLE workspace_token_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  run_id uuid NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
  period_start timestamptz NOT NULL,
  reserved_tokens integer NOT NULL CHECK (reserved_tokens > 0),
  actual_tokens integer CHECK (actual_tokens IS NULL OR actual_tokens >= 0),
  status token_reservation_status NOT NULL DEFAULT 'active',
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT workspace_token_reservations_run_unique UNIQUE (run_id)
);
CREATE INDEX workspace_token_reservations_active
  ON workspace_token_reservations (
    workspace_id,
    period_start,
    status,
    expires_at
  );

CREATE OR REPLACE FUNCTION prevent_agent_kind_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.kind IS DISTINCT FROM NEW.kind THEN
    RAISE EXCEPTION 'Agent kind is immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER agents_kind_immutable
BEFORE UPDATE OF kind ON agents
FOR EACH ROW EXECUTE FUNCTION prevent_agent_kind_change();
