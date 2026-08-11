CREATE TABLE IF NOT EXISTS call_queue (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lead_id UUID NOT NULL UNIQUE REFERENCES leads(id) ON DELETE CASCADE,
  website_url TEXT,
  maps_url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Not Called' CHECK (status IN ('Not Called','Attempted','Connected','Follow Up','Do Not Call')),
  notes TEXT NOT NULL DEFAULT '',
  last_called_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_call_queue_status ON call_queue(status);
ALTER TABLE call_queue ENABLE ROW LEVEL SECURITY;

INSERT INTO call_queue (lead_id, website_url, maps_url)
SELECT id, website_url, 'https://www.google.com/maps/search/?api=1&query=' || replace(business_name || ' ' || COALESCE(address, location), ' ', '%20')
FROM leads
WHERE phone IS NOT NULL AND btrim(phone) <> '' AND (website_url IS NULL OR btrim(website_url) = '')
ON CONFLICT (lead_id) DO NOTHING;
