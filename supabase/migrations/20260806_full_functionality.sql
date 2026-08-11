DO $$ BEGIN
  ALTER TABLE lead_enrichments ADD CONSTRAINT lead_enrichments_lead_id_key UNIQUE (lead_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
ALTER TABLE inbox_drafts_and_feedback ADD COLUMN IF NOT EXISTS email_account_id UUID REFERENCES email_accounts(id) ON DELETE SET NULL;
ALTER TABLE inbox_drafts_and_feedback ADD COLUMN IF NOT EXISTS provider_message_id TEXT;
ALTER TABLE inbox_drafts_and_feedback ADD COLUMN IF NOT EXISTS sender_email TEXT;
ALTER TABLE inbox_drafts_and_feedback ADD COLUMN IF NOT EXISTS incoming_subject TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_inbox_provider_message_id ON inbox_drafts_and_feedback(provider_message_id) WHERE provider_message_id IS NOT NULL;
