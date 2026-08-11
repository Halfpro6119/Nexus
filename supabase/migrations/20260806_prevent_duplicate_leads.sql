CREATE OR REPLACE FUNCTION normalize_lead_address(value TEXT)
RETURNS TEXT LANGUAGE SQL IMMUTABLE PARALLEL SAFE AS $$
  SELECT CASE WHEN value IS NULL THEN NULL ELSE lower(regexp_replace(regexp_replace(value, '\m(united kingdom|uk|great britain)\M', '', 'gi'), '[^a-zA-Z0-9]', '', 'g')) END
$$;

CREATE OR REPLACE FUNCTION normalize_lead_phone(value TEXT)
RETURNS TEXT LANGUAGE SQL IMMUTABLE PARALLEL SAFE AS $$
  SELECT CASE
    WHEN value IS NULL THEN NULL
    WHEN regexp_replace(value, '[^0-9]', '', 'g') LIKE '00%' THEN substring(regexp_replace(value, '[^0-9]', '', 'g') FROM 3)
    WHEN regexp_replace(value, '[^0-9]', '', 'g') LIKE '0%' AND length(regexp_replace(value, '[^0-9]', '', 'g')) >= 10 THEN '44' || substring(regexp_replace(value, '[^0-9]', '', 'g') FROM 2)
    ELSE regexp_replace(value, '[^0-9]', '', 'g')
  END
$$;

CREATE OR REPLACE FUNCTION prevent_duplicate_lead_identity()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  address_key TEXT := normalize_lead_address(NEW.address);
  phone_key TEXT := normalize_lead_phone(NEW.phone);
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(COALESCE(address_key, '') || '|' || COALESCE(phone_key, '')));
  IF address_key IS NOT NULL AND length(address_key) > 0 AND EXISTS (
    SELECT 1 FROM leads WHERE id <> NEW.id AND normalize_lead_address(address) = address_key
  ) THEN RAISE EXCEPTION 'A lead with this address already exists' USING ERRCODE = '23505'; END IF;
  IF phone_key IS NOT NULL AND length(phone_key) > 0 AND EXISTS (
    SELECT 1 FROM leads WHERE id <> NEW.id AND normalize_lead_phone(phone) = phone_key
  ) THEN RAISE EXCEPTION 'A lead with this phone number already exists' USING ERRCODE = '23505'; END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS leads_unique_identity_guard ON leads;
CREATE TRIGGER leads_unique_identity_guard BEFORE INSERT OR UPDATE OF address, phone ON leads
FOR EACH ROW EXECUTE FUNCTION prevent_duplicate_lead_identity();
