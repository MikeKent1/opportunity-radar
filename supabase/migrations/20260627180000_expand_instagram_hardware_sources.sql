-- Add the next measured Instagram monitoring batch.

insert into public.social_sources (platform, username, display_name, category, enabled)
values
  ('instagram', 'nvidiageforce', 'NVIDIA GeForce', 'hardware', true),
  ('instagram', 'amd', 'AMD', 'hardware', true),
  ('instagram', 'intelgaming', 'Intel Gaming', 'hardware', true),
  ('instagram', 'coolermaster', 'Cooler Master', 'hardware', true),
  ('instagram', 'gskillgaming', 'G.SKILL Gaming', 'hardware', true),
  ('instagram', 'thermaltakeusa', 'Thermaltake USA', 'hardware', true),
  ('instagram', 'zotacgaming', 'ZOTAC Gaming', 'hardware', true),
  ('instagram', 'aorus_official', 'AORUS', 'hardware', true),
  ('instagram', 'gigabyte_official', 'GIGABYTE', 'hardware', true),
  ('instagram', 'originpc', 'ORIGIN PC', 'hardware', true),
  ('instagram', 'maingear', 'MAINGEAR', 'hardware', true),
  ('instagram', 'cyberpowerpc', 'CyberPowerPC', 'hardware', true),
  ('instagram', 'ibuypowerpc', 'iBUYPOWER', 'hardware', true),
  ('instagram', 'drop', 'Drop', 'hardware', true),
  ('instagram', 'streamlabs', 'Streamlabs', 'creator_tools', true)
on conflict (platform, username) do update
set
  display_name = excluded.display_name,
  category = excluded.category,
  enabled = excluded.enabled;
