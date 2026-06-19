import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRATION = process.env.JWT_EXPIRATION;
const TEMP_TOKEN_EXPIRATION = '5m';

export function createToken(userId) {
  return jwt.sign(
    { id: userId },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRATION },
  );
}

export function verifyToken(token) {
  const payload = jwt.verify(token, JWT_SECRET);

  if (payload && payload.userId && !payload.id) {
    payload.id = payload.userId;
  }
  return payload;
}

/* Creates a short-lived temporary token (5 minutes) used during OAuth
 * redirect flows. The token encodes the userId and is signed with the
 * same JWT_SECRET. It is intended to be passed as a query parameter
 * (e.g. &tempToken=...) and exchanged immediately after the redirect.
 *
 * Params:
 *   userId: string | number — the authenticated user's ID
 *
 * Returns:
 *   string — a signed JWT valid for 5 minutes
 */
export function createTempToken(userId) {
  const token = jwt.sign(
    { id: userId, temp: true },
    JWT_SECRET,
    { expiresIn: TEMP_TOKEN_EXPIRATION },
  );
  return token;
}

/* Verifies a temporary token created by createTempToken.
 * Throws if the token is expired, invalid, or not flagged as a temp token.
 *
 * Params:
 *   token: string — the temp JWT from the query parameter
 *
 * Returns:
 *   object — the decoded payload containing { id, temp, iat, exp }
 *
 * Throws:
 *   JsonWebTokenError — if the token is invalid or missing the temp flag
 *   TokenExpiredError — if the token has expired
 */
export function verifyTempToken(token) {
  const payload = jwt.verify(token, JWT_SECRET);

  if (!payload || !payload.temp) {
    throw new Error('Invalid temp token: missing temp flag.');
  }

  return payload;
}
