import { describe, expect, it, vi } from "vitest";
import { BridgeApiError, BridgeClient } from "./client.js";

describe("BridgeClient", () => {
  it("paginates Bridge collection endpoints until next_uri is exhausted", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        resources: [{ id: 1 }, { id: 2 }],
        pagination: { next_uri: "/v3/aggregation/transactions?after=cursor-1" },
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        resources: [{ id: 3 }],
        pagination: { next_uri: "null" },
      }), { status: 200 }));

    const client = new BridgeClient(fetchMock as unknown as typeof fetch, "client-id", "client-secret");
    const transactions = await client.listTransactions("bridge-access-token");

    expect(transactions.map(transaction => transaction.id)).toEqual([1, 2, 3]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toBe("https://api.bridgeapi.io/v3/aggregation/transactions?after=cursor-1");
  });

  it("creates a Bridge user and retries auth when requested", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        errors: [{ message: "User not found" }],
      }), { status: 404 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "bridge-user-id" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "bridge-access-token" }), { status: 200 }));

    const client = new BridgeClient(fetchMock as unknown as typeof fetch, "client-id", "client-secret");
    const token = await client.ensureAccessToken("external-user-id", true);

    expect(token).toBe("bridge-access-token");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("surfaces Bridge API errors with response metadata", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ errors: [{ message: "Invalid body content" }] }), { status: 400, statusText: "Bad Request" }),
    );

    const client = new BridgeClient(fetchMock as unknown as typeof fetch, "client-id", "client-secret");

    await expect(client.createConnectSession("bridge-access-token")).rejects.toBeInstanceOf(BridgeApiError);
  });
});
