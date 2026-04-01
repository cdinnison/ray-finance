import { plaidClient } from "./client.js";
import { CountryCode, Products } from "plaid";

/** Create a link token for initializing Plaid Link */
export async function createLinkToken(products: Products[] = [Products.Transactions]) {
  const resp = await plaidClient.linkTokenCreate({
    user: { client_user_id: "ray-user" },
    client_name: "Ray Finance",
    products,
    optional_products: [Products.Investments, Products.Liabilities],
    country_codes: [CountryCode.Us],
    language: "en",
  });
  return resp.data.link_token;
}

/** Exchange a public token from Plaid Link for an access token */
export async function exchangeToken(publicToken: string) {
  const resp = await plaidClient.itemPublicTokenExchange({
    public_token: publicToken,
  });
  return {
    accessToken: resp.data.access_token,
    itemId: resp.data.item_id,
  };
}
