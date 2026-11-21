const crypto = require("node:crypto");

/**
 * Generate a random, cryptographically secure, URL-safe group ID.
 * Generates 12 random bytes converted to base64url (16 characters),
 * guaranteed to be >= 10 characters and matching /^[A-Za-z0-9_-]+$/.
 * @returns {string}
 */
function generateGroupId() {
  return crypto.randomBytes(12).toString("base64url");
}

/**
 * Verify whether a group ID conforms to security and URL-safety requirements:
 * string type, length >= 10, URL-safe characters only.
 * @param {any} id
 * @returns {boolean}
 */
function isValidGroupId(id) {
  if (typeof id !== "string") return false;
  if (id.length < 10) return false;
  return /^[A-Za-z0-9_-]+$/.test(id);
}

module.exports = {
  generateGroupId,
  isValidGroupId,
};
