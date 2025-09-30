#!/usr/bin/env node
const { program } = require('commander');
const glob = require('glob');
const path = require('path');
const fs = require('fs');
const { parse: parseJS } = require('@babel/parser');
const postcss = require('postcss');
const selectorParser = require('postcss-selector-parser');
const webFeatures = require('web-features');

function detectJSFeatures(ast) {
  const features = [];
  let hasAbortController = false;
  let hasFetch = false;
  let hasPromiseAllSettled = false;

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
    if (node.type === 'ExpressionStatement' && node.expression.type === 'CallExpression' && node.expression.callee.name === 'fetch') {
      hasFetch = true;
    }
    if (
      node.type === 'ExpressionStatement' &&
      node.expression.type === 'CallExpression' &&
      node.expression.callee.type === 'MemberExpression' &&
      node.expression.callee.object.name === 'Promise' &&
      node.expression.callee.property.name === 'allSettled'
    ) {
      hasPromiseAllSettled = true;
    }
  });

  if (hasAbortController) features.push({ name: 'AbortController', key: 'aborting' });
  if (hasFetch) features.push({ name: 'fetch', key: 'fetch' });
  if (hasPromiseAllSettled) features.push({ name: 'Promise.allSettled', key: 'promise-allsettled' });

  return features;
}

function detectCSSFeatures(css) {
  const features = [];
  const root = postcss.parse(css);
  root.walkRules((rule) => {
    try {
      selectorParser((selectors) => {
        selectors.walkPseudos((pseudo) => {
          if (pseudo.value === ':has') {
            features.push({ name: ':has', key: 'css-has' });
          }
        });
      }).processSync(rule.selector);
    } catch (err) {
      console.error(`Error processing selector in rule: ${rule.selector}`, err.message);
    }
  });
  return features;
}

program
  .version('1.0.0')
  .description('Baseline compatibility scanner')
  .argument('<path>', 'Folder to scan')
  .option('-o, --output <file>', 'Output JSON report to file')
  .action((folderPath, options) => {
    const fullPath = path.resolve(folderPath);
    const files = glob.sync('**/*.{js,css}', { cwd: fullPath });
    if (files.length === 0) {
      console.log('No JS/CSS files found in', fullPath);
      return;
    }

    const results = [];
    files.forEach((file) => {
      const filePath = path.join(fullPath, file);
      const code = fs.readFileSync(filePath, 'utf8');
      try {
        let detected;
        if (file.endsWith('.js')) {
          const ast = parseJS(code, { sourceType: 'module', errorRecovery: true });
          detected = detectJSFeatures(ast);
        } else if (file.endsWith('.css')) {
          detected = detectCSSFeatures(code);
        } else {
          return;
        }

        detected.forEach((feat) => {
          const featureData = webFeatures.features[feat.key];
          const status = featureData?.status?.baseline === 'high' ? 'baseline' : 'non-baseline';
          results.push({ name: feat.name, status, file });
        });
      } catch (err) {
        console.error(`Error parsing ${file}: ${err.message}`);
      }
    });

    if (results.length > 0) {
      const summary = {
        baseline: results.filter(r => r.status === 'baseline').length,
        non_baseline: results.filter(r => r.status === 'non-baseline').length
      };
      const output = { summary, features: results };
      console.log('Detected features:');
      console.log(JSON.stringify(output, null, 2));
      if (options.output) {
        fs.writeFileSync(options.output, JSON.stringify(output, null, 2));
        console.log(`Report saved to ${options.output}`);
      }
    } else {
      console.log('No supported features detected.');
    }
  });

program.parse(process.argv);