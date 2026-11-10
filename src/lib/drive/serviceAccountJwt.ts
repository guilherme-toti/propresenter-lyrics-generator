/** The signed request a Google service account trades for an access token. Only Node and zod are
 * imported, so `node --test` can load it. */

import { createSign } from "node:crypto";
import { z } from "zod";

export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
/** Read-only: listing folders and downloading files is all the app does in Drive. */
export const DRIVE_READONLY_SCOPE = "https://www.googleapis.com/auth/drive.readonly";
/** The longest Google allows. */
const ASSERTION_LIFETIME_S = 3600;

/** The fields of the .json key Google Cloud downloads for a service account that the app uses.
 * The file's own token_uri is ignored: tokens only ever come from Google's address above. */
export const serviceAccountKeySchema = z.object({
  type: z.literal("service_account"),
  client_email: z.email(),
  private_key: z.string().includes("PRIVATE KEY"),
});
export type ServiceAccountKey = z.infer<typeof serviceAccountKeySchema>;

function base64Url(text: string): string {
  return Buffer.from(text).toString("base64url");
}

/** A JWT, signed with the account's private key, asking Google for read-only Drive access. */
export function signedAssertion(key: ServiceAccountKey, nowSeconds: number): string {
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64Url(
    JSON.stringify({
      iss: key.client_email,
      scope: DRIVE_READONLY_SCOPE,
      aud: GOOGLE_TOKEN_URL,
      iat: nowSeconds,
      exp: nowSeconds + ASSERTION_LIFETIME_S,
    }),
  );
  const signature = createSign("RSA-SHA256").update(`${header}.${claims}`).sign(key.private_key).toString("base64url");
  return `${header}.${claims}.${signature}`;
}
