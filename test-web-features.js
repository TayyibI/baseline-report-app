const fs = require('fs');
const path = require('path');
const webFeatures = require('web-features');

const packagePath = path.join(__dirname, 'node_modules', 'web-features', 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
console.log('web-features version:', packageJson.version);
console.log('aborting:', webFeatures.features['aborting']);
console.log('aborting baseline status:', webFeatures.features['aborting']?.baseline?.status);