#!/usr/bin/env node
const { program } = require('commander');
const glob = require('glob');
const path = require('path');

program
  .version('1.0.0')
  .description('Baseline compatibility scanner')
  .argument('<path>', 'Folder to scan')
  .action((folderPath) => {
    const fullPath = path.resolve(folderPath);
    // Find JS and CSS files
    const files = glob.sync('**/*.{js,css}', { cwd: fullPath });
    if (files.length === 0) {
      console.log('No JS/CSS files found in', fullPath);
      return;
    }
    console.log('Found files:');
    files.forEach((file) => console.log(`- ${file}`));
  });

program.parse(process.argv);