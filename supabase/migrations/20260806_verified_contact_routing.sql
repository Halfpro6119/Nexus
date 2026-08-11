-- Route every phone-bearing lead without a verified public email to calls.
INSERT INTO call_queue (lead_id, website_url, maps_url)
SELECT l.id,
       l.website_url,
       'https://www.google.com/maps/search/?api=1&query=' || replace(l.business_name || ' ' || COALESCE(l.address, l.location), ' ', '%20')
FROM leads l
LEFT JOIN lead_enrichments e ON e.lead_id = l.id
WHERE l.phone IS NOT NULL
  AND btrim(l.phone) <> ''
  AND NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(COALESCE(e.decision_makers, '[]'::jsonb)) person
    WHERE btrim(COALESCE(person->>'email', '')) ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
      AND length(btrim(COALESCE(person->>'source', ''))) > 3
  )
ON CONFLICT (lead_id) DO NOTHING;

-- A verified public email promotes the lead to email outreach and removes it
-- from the operational call-only queue.
DELETE FROM call_queue queue
USING lead_enrichments enrichment
WHERE queue.lead_id = enrichment.lead_id
  AND EXISTS (
    SELECT 1
    FROM jsonb_array_elements(COALESCE(enrichment.decision_makers, '[]'::jsonb)) person
    WHERE btrim(COALESCE(person->>'email', '')) ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
      AND length(btrim(COALESCE(person->>'source', ''))) > 3
  );
