-- Disable Instagram sources that have consumed several low-cost actor runs without
-- producing imported giveaway opportunities. They can be re-enabled manually if
-- later monitoring shows better yield.

update public.social_sources
set enabled = false
where platform = 'instagram'
  and username in (
    'alienware',
    'asusrog',
    'bandainamcous',
    'bethesda',
    'blizzard',
    'cashapp',
    'devolverdigital',
    'ea',
    'gigabyte_official',
    'hyperx',
    'intelgaming',
    'jackpocket',
    'nintendoamerica',
    'originpc',
    'playstation',
    'riotgames',
    'scufgaming',
    'secretlab',
    'steelseries',
    'streamlabs',
    'venmo',
    'xbox'
  );
