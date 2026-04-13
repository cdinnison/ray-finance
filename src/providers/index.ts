import { bridgeProvider } from "./bridge/index.js";
import { plaidProvider } from "./plaid.js";
import type { InstitutionProvider, ProviderKey } from "./types.js";

const providers: Record<ProviderKey, InstitutionProvider> = {
  plaid: plaidProvider,
  bridge: bridgeProvider,
};

export function getProvider(key: ProviderKey): InstitutionProvider {
  return providers[key];
}

export function getAllProviders(): InstitutionProvider[] {
  return Object.values(providers);
}

export function getConfiguredProviders(): InstitutionProvider[] {
  return getAllProviders().filter(provider => provider.isConfigured());
}
