// Adds the Firebase file for Android push when it is available, so the build
// never breaks without it. On EAS the file arrives as the GOOGLE_SERVICES_JSON
// file variable; on this computer it is read from google-services.json.
// app.json stays the main config.
const fs = require('fs');
const path = require('path');

module.exports = ({ config }) => {
  const local = path.join(__dirname, 'google-services.json');
  const file = process.env.GOOGLE_SERVICES_JSON || (fs.existsSync(local) ? './google-services.json' : null);
  return file ? { ...config, android: { ...config.android, googleServicesFile: file } } : config;
};
