// A stand-in "Dartmouth login" for local development and tests ONLY.
// It acts like a SAML identity provider: shows a sign-in page and posts back a properly signed SAML response.
// Never deploy this. Run with: npm run mock-sso
import express from "express";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { inflateRawSync } from "node:zlib";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SignedXml } from "xml-crypto";

const here = dirname(fileURLToPath(import.meta.url));
const ISSUER = "https://mock-login.dartmouth.test/idp";

/** Creates (once) a throwaway RSA key + self-signed certificate for the fake identity provider. */
export function mockIdpKeys(dir = join(here, ".mock-idp")) {
  const key = join(dir, "idp.key");
  const cert = join(dir, "idp.crt");
  if (!existsSync(key) || !existsSync(cert)) {
    mkdirSync(dir, { recursive: true });
    execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", key, "-out", cert, "-days", "3650", "-subj", "/CN=Mock Dartmouth Login (dev only)"], { stdio: "ignore" });
  }
  return { key: readFileSync(key, "utf8"), cert: readFileSync(cert, "utf8"), certPath: cert };
}

const esc = value => String(value).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));

function readAuthnRequest(encoded) {
  const xml = inflateRawSync(Buffer.from(encoded, "base64")).toString("utf8");
  return {
    id: xml.match(/\sID="([^"]+)"/)?.[1],
    acs: xml.match(/AssertionConsumerServiceURL="([^"]+)"/)?.[1],
    audience: xml.match(/<(?:saml2?:)?Issuer[^>]*>([^<]+)</)?.[1]
  };
}

export function buildSignedResponse({ key, cert, inResponseTo, acs, audience, email, name, netId }) {
  const now = new Date();
  const later = new Date(now.getTime() + 5 * 60 * 1000);
  const responseId = `_${randomUUID()}`;
  const assertionId = `_${randomUUID()}`;
  const [given, ...rest] = name.split(" ");
  const attr = (attrName, value) => `<saml:Attribute Name="${attrName}"><saml:AttributeValue>${esc(value)}</saml:AttributeValue></saml:Attribute>`;
  const assertion = `<saml:Assertion xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" ID="${assertionId}" IssueInstant="${now.toISOString()}" Version="2.0">`
    + `<saml:Issuer>${ISSUER}</saml:Issuer>`
    + `<saml:Subject><saml:NameID Format="urn:oasis:names:tc:SAML:2.0:nameid-format:persistent">${esc(netId)}</saml:NameID>`
    + `<saml:SubjectConfirmation Method="urn:oasis:names:tc:SAML:2.0:cm:bearer"><saml:SubjectConfirmationData InResponseTo="${esc(inResponseTo)}" NotOnOrAfter="${later.toISOString()}" Recipient="${esc(acs)}"/></saml:SubjectConfirmation></saml:Subject>`
    + `<saml:Conditions NotBefore="${new Date(now.getTime() - 30000).toISOString()}" NotOnOrAfter="${later.toISOString()}"><saml:AudienceRestriction><saml:Audience>${esc(audience)}</saml:Audience></saml:AudienceRestriction></saml:Conditions>`
    + `<saml:AuthnStatement AuthnInstant="${now.toISOString()}" SessionIndex="${assertionId}"><saml:AuthnContext><saml:AuthnContextClassRef>urn:oasis:names:tc:SAML:2.0:ac:classes:PasswordProtectedTransport</saml:AuthnContextClassRef></saml:AuthnContext></saml:AuthnStatement>`
    + `<saml:AttributeStatement>${attr("urn:oid:0.9.2342.19200300.100.1.3", email)}${attr("urn:oid:2.16.840.1.113730.3.1.241", name)}${attr("urn:oid:2.5.4.42", given)}${attr("urn:oid:2.5.4.4", rest.join(" "))}</saml:AttributeStatement>`
    + `</saml:Assertion>`;
  const response = `<samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" ID="${responseId}" InResponseTo="${esc(inResponseTo)}" IssueInstant="${now.toISOString()}" Destination="${esc(acs)}" Version="2.0">`
    + `<saml:Issuer>${ISSUER}</saml:Issuer><samlp:Status><samlp:StatusCode Value="urn:oasis:names:tc:SAML:2.0:status:Success"/></samlp:Status>${assertion}</samlp:Response>`;

  const signer = new SignedXml({ privateKey: key, publicCert: cert });
  signer.addReference({
    xpath: "//*[local-name(.)='Assertion']",
    digestAlgorithm: "http://www.w3.org/2001/04/xmlenc#sha256",
    transforms: ["http://www.w3.org/2000/09/xmldsig#enveloped-signature", "http://www.w3.org/2001/10/xml-exc-c14n#"]
  });
  signer.canonicalizationAlgorithm = "http://www.w3.org/2001/10/xml-exc-c14n#";
  signer.signatureAlgorithm = "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256";
  signer.computeSignature(response, { location: { reference: "//*[local-name(.)='Assertion']/*[local-name(.)='Issuer']", action: "after" } });
  return Buffer.from(signer.getSignedXml()).toString("base64");
}

export function startMockIdp({ port = 8790, keys = mockIdpKeys() } = {}) {
  const app = express();
  app.use(express.urlencoded({ extended: false }));

  app.get("/sso", (req, res) => {
    const request = readAuthnRequest(String(req.query.SAMLRequest || ""));
    res.type("html").send(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Mock Dartmouth Login</title>
<style>body{font:16px/1.5 system-ui;background:#00693e;margin:0;display:grid;place-items:center;min-height:100vh}form{background:#fff;padding:28px;border-radius:6px;width:min(380px,90vw);display:grid;gap:12px}h1{margin:0;font-size:20px}small{color:#a33}input{padding:9px;font:inherit}button{padding:10px;background:#00693e;color:#fff;border:0;font:inherit;cursor:pointer}</style>
<form method="post" action="/sso">
  <h1>Dartmouth Login</h1><small>DEVELOPMENT MOCK — not the real Dartmouth login</small>
  <label>NetID<br><input name="netId" value="f00abcd" required></label>
  <label>Name<br><input name="name" value="Layla Haddad" required></label>
  <label>Email<br><input name="email" value="layla.haddad@dartmouth.edu" required></label>
  <input type="hidden" name="inResponseTo" value="${esc(request.id || "")}">
  <input type="hidden" name="acs" value="${esc(request.acs || "")}">
  <input type="hidden" name="audience" value="${esc(request.audience || "")}">
  <input type="hidden" name="relayState" value="${esc(req.query.RelayState || "")}">
  <button type="submit">Sign in</button>
</form>`);
  });

  app.post("/sso", (req, res) => {
    const samlResponse = buildSignedResponse({ ...keys, inResponseTo: req.body.inResponseTo, acs: req.body.acs, audience: req.body.audience, email: req.body.email, name: req.body.name, netId: req.body.netId });
    res.type("html").send(`<!doctype html><meta charset="utf-8"><body onload="document.forms[0].submit()">
<form method="post" action="${esc(req.body.acs)}"><input type="hidden" name="SAMLResponse" value="${samlResponse}"><input type="hidden" name="RelayState" value="${esc(req.body.relayState)}"><noscript><button>Continue</button></noscript></form>`);
  });

  return new Promise(resolve => { const server = app.listen(port, () => resolve(server)); });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const keys = mockIdpKeys();
  await startMockIdp({ keys });
  console.log(`Mock Dartmouth login running on http://localhost:8790  (dev only)

Add these to server/.env, then restart the server:
  SAML_ENTRY_POINT=http://localhost:8790/sso
  SAML_IDP_CERT=${keys.certPath}
  PUBLIC_URL=http://localhost:8787
`);
}
