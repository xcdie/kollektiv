const crypto = require('crypto');

function genId(prefix) {
  const uuid = crypto.randomUUID();
  return prefix ? `${prefix}_${uuid}` : uuid;
}

module.exports = { genId };
