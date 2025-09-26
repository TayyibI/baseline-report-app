#!/usr/bin/env node
const { program } = require('commander');
const glob = require('glob');
const path = require('path');
const fs = require('fs');
const { parse } = require('@babel/parser');
const webFeatures = require('web-features');

program
  .version('1.0.0')
  .description('Baseline compatibility scanner')
  .argument('<path>', 'Folder to scan')
  .action((folderPath) => {
    const fullPath = path.resolve(folderPath);
    const files = glob.sync('**/*.js', { cwd: fullPath });
    if (files.length === 0) {
      console.log('No JS files found in', fullPath);
      return;
    }

    const results = [];
    files.forEach((file) => {
      const filePath = path.join(fullPath, file);
      const code = fs.readFileSync(filePath, 'utf8');
      try {
        const ast = parse(code, { sourceType: 'module', errorRecovery: true });
        let hasAbortController = false;

        ast.program.body.forEach((node) => {
          if (node.type === 'NewExpression' && node.callee.name === 'AbortController') {
            hasAbortController = true;
          } else if (node.type === 'VariableDeclaration') {
            node.declarations.forEach((decl) => {
              if (decl.init && decl.init.type === 'NewExpression' && decl.init.callee.name === 'AbortController') {
                hasAbortController = true;
              }
            });
          }
        });

        if (hasAbortController) {
          const featureData = webFeatures.features['aborting'];
          const status = featureData?.status?.baseline === 'high' ? 'baseline' : 'non-baseline';
          results.push({ name: 'AbortController', status, file });
        }
      } catch (err) {
        console.error(`Error parsing ${file}: ${err.message}`);
      }
    });

    if (results.length > 0) {
      console.log('Detected features:');
      console.log(JSON.stringify(results, null, 2));
    } else {
      console.log('No supported features detected.');
    }
  });

program.parse(process.argv);