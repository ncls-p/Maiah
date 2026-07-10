CREATE OR REPLACE FUNCTION pg_temp.marketplace_strip_secret_material(value jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  result jsonb;
BEGIN
  IF value IS NULL THEN
    RETURN NULL;
  END IF;

  IF jsonb_typeof(value) = 'object' THEN
    SELECT COALESCE(
      jsonb_object_agg(entry.key, pg_temp.marketplace_strip_secret_material(entry.value)),
      '{}'::jsonb
    )
    INTO result
    FROM jsonb_each(value) AS entry
    WHERE regexp_replace(lower(entry.key), '[^a-z0-9]', '', 'g') NOT IN (
      'encryptedcredentialrefs',
      'encryptedheadersjson',
      'encryptedenvjson',
      'encryptedpayload',
      'secretsincluded',
      'credentialrefs',
      'credentialvalues',
      'headers',
      'headersjson',
      'env',
      'envjson'
    )
    AND regexp_replace(lower(entry.key), '[^a-z0-9]', '', 'g') !~
      '(apikey|accesskey|privatekey|clientsecret|secret|accesstoken|refreshtoken|authtoken|token|password|authorization|cookie)$';
    RETURN result;
  END IF;

  IF jsonb_typeof(value) = 'array' THEN
    SELECT COALESCE(
      jsonb_agg(pg_temp.marketplace_strip_secret_material(entry.value)),
      '[]'::jsonb
    )
    INTO result
    FROM jsonb_array_elements(value) AS entry(value);
    RETURN result;
  END IF;

  RETURN value;
END;
$$;
--> statement-breakpoint
UPDATE "marketplace_item_versions"
SET "manifest_json" = pg_temp.marketplace_strip_secret_material("manifest_json");
