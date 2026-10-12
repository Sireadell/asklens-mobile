// Adds the Firebase file for Android push only when it exists in this folder,
// so the build never breaks without it. app.json stays the main config.
const fs = require('fs');
const path = require('path');

module.exports = ({ config }) => {
  const has = fs.existsSync(path.join(__dirname, 'google-services.json'));
  return has ? { ...config, android: { ...config.android, googleServicesFile: './google-services.json' } } : config;
};
