import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRATION = process.env.JWT_EXPIRATION;

export function createToken(userId) {
  return jwt.sign(
    { userId },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRATION },
  );
}

export function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}