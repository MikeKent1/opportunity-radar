export type OpportunitySource =
  | 'kingsumo'
  | 'gamerpower'
  | 'epicgames'
  | 'freetogame'
  | 'cheapshark'
  | 'producthunt'
  | 'kaggle'
  | 'rss'
  | 'reddit'
  | 'eufunding'
  | 'ted'
  | 'grants'
  | (string & {});

export type Opportunity = {
  id: string;
  external_id: string;
  source: OpportunitySource;
  source_type?: 'api' | 'social' | string;
  category?: string | null;
  subcategory?: string | null;
  title: string;
  organization: string;
  summary: string;
  clean_summary?: string | null;
  prize_description?: string | null;
  eligibility?: string | null;
  quality_score?: number | null;
  risk_flags?: string[] | null;
  quality_notes?: string[] | null;
  eligible_countries?: string[] | null;
  excluded_countries?: string[] | null;
  eligible_regions?: string[] | null;
  localities?: string[] | null;
  audience_tags?: string[] | null;
  eligibility_flags?: string[] | null;
  minimum_age?: number | null;
  url: string;
  participation_url?: string | null;
  image_url: string | null;
  amount: number | null;
  currency: string;
  deadline: string | null;
  expires_at?: string | null;
  participation_steps?: string[];
  tags: string[];
  status: 'active' | 'closed' | 'draft';
  published_at: string;
  created_at?: string;
  updated_at?: string;
};
