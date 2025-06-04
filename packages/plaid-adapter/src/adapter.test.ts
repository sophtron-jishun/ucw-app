import "dotenv/config";

import {
  createClient as createCacheClient,
  createLogClient,
} from "@repo/utils/test";
import { PLAID_BASE_PATH, PLAID_BASE_PROD_PATH, PlaidAdapter } from "./adapter";
import { Connection, ConnectionStatus } from "@repo/utils";

const cacheClient = createCacheClient();
const logClient = createLogClient();

jest.mock("uuid", () => ({ v4: () => "123456789" }));

const aggregatorCredentials = {
  plaidSandbox: {
    clientId: "test-clientId",
    secret: "test-app-secret",
  },
  plaidProd: {
    clientId: "prod-test-clientId",
    secret: "prod-test-app-secret",
  },
};

const plaidAdapterSandbox = new PlaidAdapter({
  sandbox: true,
  dependencies: {
    cacheClient,
    logClient,
    aggregatorCredentials,
    envConfig: {
      HostUrl: "http://localhost:8080",
    },
  },
});

const plaidAdapter = new PlaidAdapter({
  sandbox: false,
  dependencies: {
    cacheClient,
    logClient,
    aggregatorCredentials,
    envConfig: {
      HostUrl: "http://localhost:8080",
    },
  },
});

describe("plaid aggregator", () => {
  describe("GetInsitutionById", () => {
    it("Maps correct fields", async () => {
      const ret = await plaidAdapterSandbox.GetInstitutionById("testId");
      expect(ret).toEqual({
        id: "testId",
        aggregator: "plaid_sandbox",
        supportsOauth: true,
      });
    });
  });

  describe("ListInstitutionCredentials", () => {
    it("transforms the credentials into useable form, not available with plaid atm", async () => {
      expect(await plaidAdapter.ListInstitutionCredentials("testId")).toEqual(
        [],
      );
    });
  });

  describe("ListConnectionCredentials", () => {
    it("retreieves and transforms member credentials, not available with plaid atm", async () => {
      expect(
        await plaidAdapter.ListConnectionCredentials(
          "testMemberId",
          "test-user-name",
        ),
      ).toEqual([]);
    });
  });

  describe("ListConnections", () => {
    it("retrieves and transforms the members, not available with plaid atm", async () => {
      expect(await plaidAdapter.ListConnections("testId")).toEqual([]);
    });
  });

  describe("CreateConnection, getConnectionById, GetConnectionStatus", () => {
    const baseConnectionRequest = {
      credentials: [],
      institutionId: "testInstitutionId",
    };
    const testUserId = "test-user-id";

    it("creates a connection and gets the connection by id then gets the status", async () => {
      const oauth_window_uri_example =
        "https://idp.ddp.plaid.com/auth?connector=testInstitutionId&client_id=prod-test-clientId&redirect_uri=http%3A%2F%2Flocalhost%3A8080%2Foauth%2Fplaid%2Fredirect_from&state=123456789&response_type=code&scope=openid+profile+offline_access";

      const connection = await plaidAdapter.CreateConnection(
        {
          ...baseConnectionRequest,
          is_oauth: true,
        },
        testUserId,
      );
      const connectionId = connection.id;

      const expectedConnectionObj = {
        id: connectionId,
        institution_code: "testInstitutionId",
        is_oauth: true,
        oauth_window_uri: oauth_window_uri_example,
        aggregator: "plaid",
        credentials: [],
        status: ConnectionStatus.CREATED,
        userId: testUserId,
      };

      expect(connection).toEqual(expectedConnectionObj);

      const connectionById = await plaidAdapter.GetConnectionById(connectionId);
      expect(connectionById).toEqual(expectedConnectionObj);

      const connectionStatus = await plaidAdapter.GetConnectionStatus(
        connectionId,
        "",
      );

      expect(connectionStatus.status).toEqual(ConnectionStatus.PENDING);
    });

    it("gets the proper oauth_window_uri for production", async () => {
      const connection = await plaidAdapter.CreateConnection(
        {
          ...baseConnectionRequest,
          is_oauth: true,
        },
        testUserId,
      );

      const oauthUrl = new URL(connection.oauth_window_uri);
      expect(oauthUrl.origin).toBe(PLAID_BASE_PROD_PATH);
      expect(oauthUrl.pathname).toBe("/auth");

      const search = oauthUrl.searchParams;
      expect(search.get("redirect_uri")).toBe(
        "http://localhost:8080/oauth/plaid/redirect_from",
      );
    });

    it("gets the proper oauth_window_uri for sandbox", async () => {
      const connection = await plaidAdapterSandbox.CreateConnection(
        {
          ...baseConnectionRequest,
          is_oauth: true,
        },
        testUserId,
      );

      const oauthUrl = new URL(connection.oauth_window_uri);
      expect(oauthUrl.origin).toBe(PLAID_BASE_PATH);
      expect(oauthUrl.pathname).toBe("/auth");

      const search = oauthUrl.searchParams;
      expect(search.get("redirect_uri")).toBe(
        "http://localhost:8080/oauth/plaid_sandbox/redirect_from",
      );
    });
  });

  describe("ResolveUserId", () => {
    it("returns the user_id from parameter", async () => {
      const returnedUserId = await plaidAdapter.ResolveUserId("user_id");

      expect(returnedUserId).toEqual("user_id");
    });
  });

  describe("DeleteConnection", () => {
    it("deletes the connection", async () => {
      await plaidAdapter.DeleteConnection("testId", "test-user-name");
      const cached = await cacheClient.get("testId");
      expect(cached).toBe(null);
    });
  });

  describe("DeleteUser", () => {
    it("is not available with plaid", async () => {
      const ret = await plaidAdapter.DeleteUser("test-user-name");
      expect(ret).toEqual(undefined);
    });
  });

  describe("UpdateConnection", () => {
    it("is not available with plaid", async () => {
      const ret = await plaidAdapter.UpdateConnection(null);
      expect(ret).toEqual(undefined);
    });
  });

  describe("HandleOauthResponse", () => {
    it("returns the updated connection if valid code and connection is found", async () => {
      const requestId = "abc123";
      const connection: Connection = {
        id: requestId,
        status: ConnectionStatus.PENDING,
        institution_code: "inst-001",
        userId: null,
      };

      await cacheClient.set(requestId, connection);

      const result = await plaidAdapter.HandleOauthResponse({
        query: {
          state: requestId,
          code: "fake_oauth_code",
        },
      });

      expect(result).toEqual({
        status: ConnectionStatus.CONNECTED,
        institution_code: "inst-001",
        id: "inst-001",
        postMessageEventData: {
          memberConnected: {
            plaidAuthCode: "fake_oauth_code",
          },
          memberStatusUpdate: {
            plaidAuthCode: "fake_oauth_code",
          },
        },
        userId: null,
      });

      const cached = await cacheClient.get(requestId);
      expect(cached).toEqual(result);
    });

    it("throws if connection not found in cache", async () => {
      const request = {
        query: {
          state: "nonexistent",
          code: "code123",
        },
      };

      await expect(plaidAdapter.HandleOauthResponse(request)).rejects.toThrow(
        "Connection failed",
      );
    });

    it("Gets status DENIED if no code in the request query", async () => {
      const requestId = "abc123";
      await cacheClient.set(requestId, {});

      const result = await plaidAdapter.HandleOauthResponse({
        query: {
          state: requestId,
        },
      });

      expect(result.status).toEqual(ConnectionStatus.DENIED);

      const cached = (await cacheClient.get(requestId)) as { status: string };
      expect(cached.status).toEqual(ConnectionStatus.DENIED);
    });
  });
});
