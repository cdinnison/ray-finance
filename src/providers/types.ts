import type BetterSqlite3 from "libsql";

export type Database = BetterSqlite3.Database;
export type ProviderKey = "plaid" | "bridge";

export interface InstitutionRecord {
  item_id: string;
  provider: ProviderKey;
  access_token: string;
  provider_user_id: string | null;
  provider_state: string;
  name: string;
  products: string;
  cursor: string | null;
  primary_color: string | null;
  logo?: string | null;
  created_at?: string | null;
}

export interface ProviderSyncResult {
  transactionsAdded: number;
  synced: boolean;
  reconnectRequired?: boolean;
  message?: string;
}

export interface InstitutionProvider {
  key: ProviderKey;
  displayName: string;
  isConfigured(): boolean;
  missingConfigMessage(): string;
  link(db: Database): Promise<void>;
  syncInstitution(db: Database, institution: InstitutionRecord): Promise<ProviderSyncResult>;
}
