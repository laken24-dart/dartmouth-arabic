// Dartmouth single sign-on over SAML 2.0 (Dartmouth's supported protocol for app integrations).
// This server is the "service provider"; Dartmouth's login service is the "identity provider".
import { existsSync, readFileSync } from "node:fs";
import { SAML } from "@node-saml/node-saml";

// Common attribute names (friendly + standard OIDs) identity providers use for email and name.
const EMAIL_ATTRS = ["email", "mail", "urn:oid:0.9.2342.19200300.100.1.3", "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress", "eduPersonPrincipalName", "urn:oid:1.3.6.1.4.1.5923.1.1.1.6"];
const NAME_ATTRS = ["displayName", "urn:oid:2.16.840.1.113730.3.1.241", "name", "cn", "urn:oid:2.5.4.3", "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name"];
const GIVEN_ATTRS = ["givenName", "urn:oid:2.5.4.42", "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname"];
const SURNAME_ATTRS = ["sn", "surname", "urn:oid:2.5.4.4", "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname"];

/** Accepts a PEM string, a path to a PEM file, or a bare base64 certificate body. */
function loadPem(value) {
  if (!value) return undefined;
  const text = existsSync(value) ? readFileSync(value, "utf8") : value.replace(/\\n/g, "\n");
  return text.trim();
}

const first = (profile, names) => {
  for (const name of names) {
    const value = profile[name] ?? profile.attributes?.[name];
    const single = Array.isArray(value) ? value[0] : value;
    if (typeof single === "string" && single.trim()) return single.trim();
  }
  return "";
};

/**
 * env: SAML_ENTRY_POINT, SAML_IDP_CERT, PUBLIC_URL, SAML_ISSUER?, SAML_SP_PRIVATE_KEY?, SAML_SP_CERT?,
 *      SAML_WANT_RESPONSE_SIGNED?, SAML_EMAIL_ATTRIBUTE?, SAML_NAME_ATTRIBUTE?, SSO_LABEL?
 * Returns null when SSO isn't configured.
 */
export function createSso(env) {
  const entryPoint = env.SAML_ENTRY_POINT;
  const idpCert = loadPem(env.SAML_IDP_CERT);
  if (!entryPoint || !idpCert) return null;
  const publicUrl = String(env.PUBLIC_URL || "").replace(/\/$/, "");
  if (!publicUrl) throw new Error("PUBLIC_URL must be set when SSO is enabled (e.g. https://arabic.dartmouth.edu).");
  const callbackUrl = `${publicUrl}/api/auth/sso/callback`;
  const issuer = env.SAML_ISSUER || `${publicUrl}/api/auth/sso/metadata`;
  const privateKey = loadPem(env.SAML_SP_PRIVATE_KEY);
  const spCert = loadPem(env.SAML_SP_CERT);

  const saml = new SAML({
    entryPoint,
    idpCert,
    issuer,
    callbackUrl,
    audience: issuer,
    privateKey,
    decryptionPvk: privateKey,
    publicCert: spCert,
    wantAssertionsSigned: true,
    wantAuthnResponseSigned: env.SAML_WANT_RESPONSE_SIGNED === "true",
    validateInResponseTo: "always",
    requestIdExpirationPeriodMs: 10 * 60 * 1000,
    acceptedClockSkewMs: 60 * 1000,
    identifierFormat: env.SAML_IDENTIFIER_FORMAT || null,
    disableRequestedAuthnContext: true,
    signatureAlgorithm: "sha256",
    digestAlgorithm: "sha256"
  });

  return {
    label: env.SSO_LABEL || "Dartmouth",
    callbackUrl,
    issuer,
    /** URL to send the browser to. RelayState comes back untouched with the response. */
    loginUrl: relayState => saml.getAuthorizeUrlAsync(relayState, undefined, {}),
    /** Validates the signed response; returns { email, name, ssoId } or throws. */
    async readResponse(body) {
      const { profile, loggedOut } = await saml.validatePostResponseAsync(body);
      if (loggedOut || !profile) throw new Error("No sign-in came back from Dartmouth.");
      const email = (first(profile, [env.SAML_EMAIL_ATTRIBUTE, ...EMAIL_ATTRS].filter(Boolean)) || (/@/.test(profile.nameID || "") ? profile.nameID : "")).toLowerCase();
      const given = first(profile, GIVEN_ATTRS);
      const surname = first(profile, SURNAME_ATTRS);
      const name = first(profile, [env.SAML_NAME_ATTRIBUTE, ...NAME_ATTRS].filter(Boolean)) || [given, surname].filter(Boolean).join(" ") || email.split("@")[0];
      const ssoId = `${profile.issuer || "idp"}|${profile.nameID || email}`;
      if (!email) throw new Error("Dartmouth didn’t share an email address for this account.");
      return { email, name, ssoId };
    },
    metadata: () => saml.generateServiceProviderMetadata(privateKey ? spCert ?? null : null, spCert ?? null)
  };
}
