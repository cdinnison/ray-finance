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

  it("refuses to follow off-origin or plaintext http pagination next_uri values", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({
        resources: [{ id: 1 }],
        pagination: { next_uri: "https://attacker.example/steal" },
      }), { status: 200 }),
    );

    const client = new BridgeClient(fetchMock as unknown as typeof fetch, "client-id", "client-secret");
    await expect(client.listTransactions("bridge-access-token")).rejects.toThrow(/untrusted origin/i);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const httpFetchMock = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({
        resources: [{ id: 1 }],
        pagination: { next_uri: "http://api.bridgeapi.io/v3/aggregation/transactions?after=1" },
      }), { status: 200 }),
    );
    const httpClient = new BridgeClient(httpFetchMock as unknown as typeof fetch, "client-id", "client-secret");
    await expect(httpClient.listTransactions("bridge-access-token")).rejects.toThrow(/untrusted origin/i);
    expect(httpFetchMock).toHaveBeenCalledTimes(1);
  });

  it("detects pagination loops and URL-encodes path parameters", async () => {
    const loopFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        resources: [{ id: 1 }],
        pagination: { next_uri: "/v3/aggregation/transactions" },
      }), { status: 200 }),
    );
    const loopClient = new BridgeClient(loopFetch as unknown as typeof fetch, "client-id", "client-secret");
    await expect(loopClient.listTransactions("bridge-access-token")).rejects.toThrow(/loop/i);

    const itemFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "1" }), { status: 200 }));
    const itemClient = new BridgeClient(itemFetch as unknown as typeof fetch, "client-id", "client-secret");
    await itemClient.getItem("tok", "../admin");
    expect(itemFetch.mock.calls[0][0]).toBe("https://api.bridgeapi.io/v3/aggregation/items/..%2Fadmin");
  });
});
