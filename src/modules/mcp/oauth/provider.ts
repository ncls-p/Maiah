import type {
  OAuthClientProvider,
  OAuthDiscoveryState,
} from "@modelcontextprotocol/sdk/client/auth.js";
import type {
  OAuthClientInformationMixed,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import { assertMcpUrl } from "../network";

export type OAuthData = {
  revision: string;
  serverUrl: string;
  client?: OAuthClientInformationMixed;
  tokens?: OAuthTokens;
  expiresAt?: number;
  discovery?: OAuthDiscoveryState;
  verifier?: string;
};
export type ProviderConfig = {
  clientId: string | null;
  clientSecret?: string;
  scopes: string;
  dynamicRegistration: boolean;
};
export class McpOAuthProvider implements OAuthClientProvider {
  authorizationUrl?: string;
  constructor(
    public data: OAuthData,
    private config: ProviderConfig,
    public redirectUrl: string,
    private stateValue = "",
  ) {}
  get clientMetadata() {
    return {
      client_name: "Maiah",
      redirect_uris: [this.redirectUrl],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: this.config.clientSecret
        ? "client_secret_post"
        : "none",
      scope: this.config.scopes || undefined,
    };
  }
  state() {
    return this.stateValue;
  }
  clientInformation() {
    return this.config.clientId
      ? {
          client_id: this.config.clientId,
          ...(this.config.clientSecret
            ? { client_secret: this.config.clientSecret }
            : {}),
        }
      : this.data.client;
  }
  saveClientInformation = async (client: OAuthClientInformationMixed) => {
    if (!this.config.dynamicRegistration)
      throw new Error("MCP_OAUTH_CLIENT_REQUIRED");
    this.data.client = client;
  };
  tokens() {
    return this.data.tokens;
  }
  saveTokens = async (tokens: OAuthTokens) => {
    if (tokens.token_type.toLowerCase() !== "bearer")
      throw new Error("MCP_OAUTH_TOKEN_TYPE");
    this.data.tokens = tokens;
    this.data.expiresAt =
      tokens.expires_in === undefined
        ? undefined
        : Date.now() + tokens.expires_in * 1000;
  };
  redirectToAuthorization = async (url: URL) => {
    assertMcpUrl(url);
    if (!this.stateValue || url.searchParams.get("state") !== this.stateValue)
      throw new Error("MCP_OAUTH_INTERACTION_REQUIRED");
    this.authorizationUrl = url.toString();
  };
  saveCodeVerifier = async (value: string) => {
    this.data.verifier = value;
  };
  codeVerifier() {
    if (!this.data.verifier) throw new Error("MCP_OAUTH_STATE_INVALID");
    return this.data.verifier;
  }
  saveDiscoveryState = async (discovery: OAuthDiscoveryState) => {
    const meta = discovery.authorizationServerMetadata;
    if (!meta || !meta.code_challenge_methods_supported?.includes("S256"))
      throw new Error("MCP_OAUTH_PKCE_REQUIRED");
    if (
      meta.issuer &&
      new URL(meta.issuer).href !==
        new URL(discovery.authorizationServerUrl).href
    )
      throw new Error("MCP_OAUTH_ISSUER_MISMATCH");
    for (const value of [
      discovery.authorizationServerUrl,
      meta.authorization_endpoint,
      meta.token_endpoint,
      meta.registration_endpoint,
      "revocation_endpoint" in meta ? meta.revocation_endpoint : undefined,
    ])
      if (typeof value === "string") assertMcpUrl(value);
    this.data.discovery = discovery;
  };
  discoveryState() {
    return this.data.discovery;
  }
  invalidateCredentials = async (scope: string) => {
    if (["all", "tokens"].includes(scope)) {
      delete this.data.tokens;
      delete this.data.expiresAt;
    }
    if (["all", "client"].includes(scope)) delete this.data.client;
    if (["all", "verifier"].includes(scope)) delete this.data.verifier;
    if (["all", "discovery"].includes(scope)) delete this.data.discovery;
  };
}
