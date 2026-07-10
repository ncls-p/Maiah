-- Historical tool payloads were stored directly in metadata_json before
-- encrypted message-part storage was introduced. They cannot be encrypted in
-- SQL because application encryption uses AES-GCM and a managed key, so remove
-- the raw input/output while preserving identifiers needed to render a useful
-- history row. New writes keep the raw payload in content_encrypted and only a
-- secret-aware display projection in metadata_json.
UPDATE message_parts
SET metadata_json = jsonb_strip_nulls(
  jsonb_build_object(
    'type', metadata_json -> 'type',
    'toolCallId', metadata_json -> 'toolCallId',
    'toolName', metadata_json -> 'toolName',
    'state', metadata_json -> 'state',
    'redacted', true,
    CASE WHEN type = 'tool-call' THEN 'input' ELSE 'output' END,
    jsonb_build_object(
      'redacted', true,
      'message', 'Historical tool payload removed during security migration'
    )
  )
)
WHERE type IN ('tool-call', 'tool-result')
  AND metadata_json IS NOT NULL
  AND content_encrypted IS NULL;
