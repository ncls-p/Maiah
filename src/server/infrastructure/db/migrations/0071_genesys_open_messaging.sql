CREATE TABLE genesys_connections (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
 label text NOT NULL, region text NOT NULL, integration_id uuid NOT NULL, client_id uuid NOT NULL,
 encrypted_secrets text NOT NULL, enabled boolean NOT NULL DEFAULT false, validated_at timestamptz,
 validation_error text, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX genesys_region_integration_unique ON genesys_connections(region, integration_id);
CREATE TABLE genesys_projects (
 workspace_id uuid PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
 connection_id uuid NOT NULL REFERENCES genesys_connections(id) ON DELETE CASCADE
);
CREATE TABLE genesys_sessions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), connection_id uuid NOT NULL REFERENCES genesys_connections(id) ON DELETE CASCADE,
 conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE, workspace_id uuid NOT NULL, user_id uuid NOT NULL,
 external_conversation_id uuid, state text NOT NULL DEFAULT 'requested', error_code text,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT genesys_session_state CHECK (state IN ('requested','waiting','human','closing','uncertain','failed','completed','resumed'))
);
CREATE UNIQUE INDEX genesys_active_conversation_unique ON genesys_sessions(conversation_id) WHERE state <> 'resumed';
CREATE INDEX genesys_sessions_connection_idx ON genesys_sessions(connection_id);
CREATE TABLE genesys_deliveries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), session_id uuid NOT NULL REFERENCES genesys_sessions(id) ON DELETE CASCADE,
 message_id uuid NOT NULL, external_id text, direction text NOT NULL, encrypted_text text NOT NULL,
 state text NOT NULL DEFAULT 'queued', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT genesys_delivery_state CHECK (state IN ('queued','sending','sent','failed','uncertain','cancelled')),
 CONSTRAINT genesys_delivery_direction CHECK (direction IN ('inbound','outbound'))
);
CREATE UNIQUE INDEX genesys_delivery_message_unique ON genesys_deliveries(session_id, message_id);
CREATE UNIQUE INDEX genesys_delivery_external_unique ON genesys_deliveries(session_id, external_id);
CREATE INDEX genesys_deliveries_pending_idx ON genesys_deliveries(state, created_at);
-- Serialize assistant admission with handoff creation, including other chat entry points.
CREATE FUNCTION guard_genesys_assistant_admission() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.role = 'assistant' AND NEW.status IN ('pending','streaming') THEN
   PERFORM id FROM conversations WHERE id = NEW.conversation_id FOR UPDATE;
   IF EXISTS (SELECT 1 FROM genesys_sessions WHERE conversation_id = NEW.conversation_id AND state <> 'resumed') THEN
     RAISE EXCEPTION 'GENESYS_HANDOFF_ACTIVE' USING ERRCODE = '23514';
   END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER genesys_assistant_admission BEFORE INSERT OR UPDATE OF status ON messages
 FOR EACH ROW EXECUTE FUNCTION guard_genesys_assistant_admission();

-- A connection can be removed after verified resumption, while active external sessions
-- retain their credentials until they have been closed.
CREATE FUNCTION guard_genesys_connection_deletion() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS (SELECT 1 FROM genesys_sessions WHERE connection_id = OLD.id AND state <> 'resumed') THEN
   RAISE EXCEPTION 'GENESYS_CONNECTION_IN_USE' USING ERRCODE = '23514';
 END IF;
 RETURN OLD;
END $$;
CREATE TRIGGER genesys_connection_deletion BEFORE DELETE ON genesys_connections
 FOR EACH ROW EXECUTE FUNCTION guard_genesys_connection_deletion();
