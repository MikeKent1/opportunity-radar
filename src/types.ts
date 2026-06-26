export type OpportunitySource =
  | 'kingsumo'
  | 'gamerpower'
  | 'epicgames'
  | 'freetogame'
  | 'cheapshark'
  | 'producthunt'
  | 'kaggle'
  | 'rss'
  | 'eufunding'
  | 'ted'
  | 'grants';

export type Opportunity = {
  id: string;
  external_id: string;
  source: OpportunitySource;
  title: string;
  organization: string;
  summary: string;
  url: string;
  image_url: string | null;
  amount: number | null;
  currency: string;
  deadline: string | null;
  tags: string[];
  status: 'active' | 'closed' | 'draft';
  published_at: string;
  created_at?: string;
  updated_at?: string;
};
