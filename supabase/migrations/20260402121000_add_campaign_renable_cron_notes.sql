-- Schedule automatic re-enable of disabled campaigns every 6 hours
-- This ensures campaigns disabled more than 36 hours ago are automatically re-enabled

-- Note: You'll need to call the reenable-disabled-campaigns edge function
-- or run the SQL directly. For now, this serves as documentation.
-- 
-- The function reenable-disabled-campaigns handles:
-- 1. Finding all campaigns with is_active = false and disabled_at older than 36 hours
-- 2. Setting is_active = true and disabled_at = null for those campaigns
-- 3. Returning a list of re-enabled campaigns

-- If you have pg_cron enabled, you could use:
-- SELECT cron.schedule('reenable-campaigns-daily', '0 */6 * * *', 
--   'SELECT http_post(
--     current_setting(''custom.supabase_url'') || ''/functions/v1/reenable-disabled-campaigns'',
--     ''{}''::jsonb,
--     ''{"Content-Type":"application/json"}'')');

-- For now, manually invoke via:
-- curl -X POST https://YOUR-SUPABASE-URL/functions/v1/reenable-disabled-campaigns
