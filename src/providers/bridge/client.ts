import { config } from "../../config.js";

const BRIDGE_BASE_URL = "https://api.bridgeapi.io";
const BRIDGE_ORIGIN = new URL(BRIDGE_BASE_URL).origin;
const BRIDGE_VERSION = "2025-01-15";
const MAX_PAGINATION_PAGES = 500;
const REQUEST_TIMEOUT_MS = 30_000;

export interface BridgeUser {
  id?: string | number;
  uuid?: string;
  external_user_id?: string;
}

export interface BridgeProviderInfo {
  id?: string | number;
  name?: string;
  display_name?: string;
}

export interface BridgeItem {
  id: string | number;
  provider_id?: string | number | null;
  status?: number | string | null;
  status_code?: number | string | null;
  status_code_info?: string | null;
  authentication_expires_at?: string | null;
  updated_at?: string | null;
}

export interface BridgeAccount {
  id: string | number;
  item_id?: string | number | null;
  name?: string | null;
  clean_name?: string | null;
  official_name?: string | null;
  iban?: string | null;
  currency_code?: string | null;
  type?: string | null;
  subtype?: string | null;
  current_balance?: number | null;
  available_balance?: number | null;
  balance?: number | null;
  accounting_balance?: number | null;
  instant_balance?: number | null;
  updated_at?: string | null;
}

export interface BridgeTransaction {
  id: string | number;
  account_id?: string | number | null;
  amount?: number | null;
  date?: string | null;
  clean_description?: string | null;
  provider_description?: string | null;
  currency_code?: string | null;
  updated_at?: string | null;
  deleted?: boolean;
  future?: boolean;
  operation_type?: string | null;
  category_id?: string | number | null;
}

interface BridgeCollectionResponse<T> {
  resources?: T[];
  pagination?: {
    next_uri?: string | null;
  };
}

interface BridgeConnectSessionResponse {
  id: string;
  url: string;
}

interface BridgeAuthorizationTokenResponse {
  access_token?: string;
  token?: string;
}

export class BridgeApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: unknown,
  ) {
    super(message);
  }
}

export class BridgeClient {
  constructor(
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly clientId: string = config.bridgeClientId,
    private readonly clientSecret: string = config.bridgeClientSecret,
  ) {}

  private assertConfigured(): void {
    if (!this.clientId || !this.clientSecret) {
      throw new Error("Bridge credentials are not configured.");
    }
  }

  private buildHeaders(accessToken?: string, includeJson = false): HeadersInit {
    this.assertConfigured();

    return {
      Accept: "application/json",
      "Bridge-Version": BRIDGE_VERSION,
      "Client-Id": this.clientId,
      "Client-Secret": this.clientSecret,
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...(includeJson ? { "Content-Type": "application/json" } : {}),
    };
  }

  private normalizePath(path: string): string {
    const resolved = new URL(path, BRIDGE_BASE_URL);
    if (resolved.protocol !== "https:" || resolved.origin !== BRIDGE_ORIGIN) {
      throw new Error(`Refusing to send Bridge credentials to untrusted origin: ${resolved.origin}`);
    }
    return resolved.toString();
  }

  private async request<T>(
    path: string,
    options: {
      method?: string;
      accessToken?: string;
      body?: unknown;
    } = {},
  ): Promise<T> {
    const response = await this.fetchImpl(this.normalizePath(path), {
      method: options.method || (options.body ? "POST" : "GET"),
      headers: this.buildHeaders(options.accessToken, options.body !== undefined),
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    const text = await response.text();
    const data = text ? JSON.parse(text) : null;

    if (!response.ok) {
      const message = (data as any)?.message || (data as any)?.errors?.[0]?.message || response.statusText;
      throw new BridgeApiError(message || "Bridge request failed", response.status, data);
    }

    return data as T;
  }

  private async paginate<T>(path: string, accessToken: string): Promise<T[]> {
    const resources: T[] = [];
    const seen = new Set<string>();
    let nextPath: string | null = path;
    let pages = 0;

    while (nextPath) {
      const normalized = this.normalizePath(nextPath);
      if (seen.has(normalized)) {
        throw new Error("Bridge pagination loop detected.");
      }
      if (++pages > MAX_PAGINATION_PAGES) {
        throw new Error(`Bridge pagination exceeded maximum page limit (${MAX_PAGINATION_PAGES}).`);
      }
      seen.add(normalized);

      const data: BridgeCollectionResponse<T> = await this.request<BridgeCollectionResponse<T>>(normalized, { accessToken });
      resources.push(...(data.resources || []));

      const nextUri: string | null | undefined = data.pagination?.next_uri;
      nextPath = nextUri && nextUri !== "null" ? nextUri : null;
    }

    return resources;
  }

  async createUser(externalUserId: string): Promise<BridgeUser> {
    return this.request<BridgeUser>("/v3/aggregation/users", {
      method: "POST",
      body: { external_user_id: externalUserId },
    });
  }

  async createAuthorizationToken(externalUserId: string): Promise<string> {
    const data = await this.request<BridgeAuthorizationTokenResponse>("/v3/aggregation/authorization/token", {
      method: "POST",
      body: { external_user_id: externalUserId },
    });

    const token = data.access_token || data.token;
    if (!token) throw new Error("Bridge did not return an access token.");
    return token;
  }

  async ensureAccessToken(externalUserId: string, createUserIfNeeded = false): Promise<string> {
    try {
      return await this.createAuthorizationToken(externalUserId);
    } catch (error) {
      if (!createUserIfNeeded) throw error;
      await this.createUser(externalUserId).catch(() => undefined);
      return this.createAuthorizationToken(externalUserId);
    }
  }

  async createConnectSession(
    accessToken: string,
    options: {
      itemId?: string;
      userEmail?: string;
      accountTypes?: string;
      forceReauthentication?: boolean;
    } = {},
  ): Promise<BridgeConnectSessionResponse> {
    const body: Record<string, unknown> = {
      account_types: options.accountTypes || "all",
    };

    if (options.itemId) {
      body.item_id = /^\d+$/.test(options.itemId) ? Number(options.itemId) : options.itemId;
    }
    if (options.userEmail) body.user_email = options.userEmail;
    if (options.forceReauthentication) body.force_reauthentication = true;

    return this.request<BridgeConnectSessionResponse>("/v3/aggregation/connect-sessions", {
      method: "POST",
      accessToken,
      body,
    });
  }

  async listItems(accessToken: string): Promise<BridgeItem[]> {
    return this.paginate<BridgeItem>("/v3/aggregation/items", accessToken);
  }

  async getItem(accessToken: string, itemId: string): Promise<BridgeItem> {
    return this.request<BridgeItem>(`/v3/aggregation/items/${encodeURIComponent(itemId)}`, { accessToken });
  }

  async listAccounts(accessToken: string): Promise<BridgeAccount[]> {
    return this.paginate<BridgeAccount>("/v3/aggregation/accounts", accessToken);
  }

  async listTransactions(accessToken: string, since?: string): Promise<BridgeTransaction[]> {
    const path = since
      ? `/v3/aggregation/transactions?since=${encodeURIComponent(since)}`
      : "/v3/aggregation/transactions";
    return this.paginate<BridgeTransaction>(path, accessToken);
  }

  async getProvider(providerId: string | number): Promise<BridgeProviderInfo> {
    return this.request<BridgeProviderInfo>(`/v3/providers/${encodeURIComponent(String(providerId))}`);
  }
}
