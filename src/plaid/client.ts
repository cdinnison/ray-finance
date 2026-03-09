import { Configuration, PlaidApi, PlaidEnvironments } from "plaid";
import { config, useManaged, RAY_PROXY_BASE } from "../config.js";

function buildPlaidConfig(): Configuration {
  if (useManaged()) {
    return new Configuration({
      basePath: `${RAY_PROXY_BASE}/plaid`,
      baseOptions: {
        headers: { Authorization: `Bearer ${config.rayApiKey}` },
      },
    });
  }

  return new Configuration({
    basePath: PlaidEnvironments[config.plaidEnv],
    baseOptions: {
      headers: {
        "PLAID-CLIENT-ID": config.plaidClientId,
        "PLAID-SECRET": config.plaidSecret,
      },
    },
  });
}

export const plaidClient = new PlaidApi(buildPlaidConfig());
