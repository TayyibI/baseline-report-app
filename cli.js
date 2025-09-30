#!/usr/bin/env node
const { program } = require('commander');
const glob = require('glob');
const path = require('path');
const fs = require('fs');
const { parse: parseJS } = require('@babel/parser');
const postcss = require('postcss');
const selectorParser = require('postcss-selector-parser');
const webFeatures = require('web-features');

function detectJSFeatures(ast, verbose = false) {
  const features = [];
  let hasAbortController = false;
  let hasFetch = false;
  let hasPromiseAllSettled = false;
  let hasAsyncAwait = false;

  ast.program.body.forEach((node) => {
    if (verbose) console.log(`JS Node: ${node.type}`);
    if (node.type === 'NewExpression' && node.callee.name === 'AbortController') {
      hasAbortController = true;
      if (verbose) console.log('Detected AbortController');
    } else if (node.type === 'VariableDeclaration') {
      node.declarations.forEach((decl) => {
        if (decl.init && decl.init.type === 'NewExpression' && decl.init.callee.name === 'AbortController') {
          hasAbortController = true;
          if (verbose) console.log('Detected AbortController in variable');
        }
      });
    }
    if (node.type === 'ExpressionStatement' && node.expression.type === 'CallExpression' && node.expression.callee.name === 'fetch') {
      hasFetch = true;
      if (verbose) console.log('Detected fetch');
    }
    if (
      node.type === 'ExpressionStatement' &&
      node.expression.type === 'CallExpression' &&
      node.expression.callee.type === 'MemberExpression' &&
      node.expression.callee.object.name === 'Promise' &&
      node.expression.callee.property.name === 'allSettled'
    ) {
      hasPromiseAllSettled = true;
      if (verbose) console.log('Detected Promise.allSettled');
    }
    if (node.type === 'FunctionDeclaration' && node.async || node.type === 'ArrowFunctionExpression' && node.async || node.type === 'AwaitExpression') {
      hasAsyncAwait = true;
      if (verbose) console.log('Detected async/await');
    }
  });

  if (hasAbortController) features.push({ name: 'AbortController', key: 'aborting' });
  if (hasFetch) features.push({ name: 'fetch', key: 'fetch' });
  if (hasPromiseAllSettled) features.push({ name: 'Promise.allSettled', key: 'promise-allsettled' });
  if (hasAsyncAwait) features.push({ name: 'async/await', key: 'async-await' });

  return features;
}

function detectCSSFeatures(css, verbose = false) {
  const features = [];
  const root = postcss.parse(css);
  root.walkRules((rule) => {
    if (verbose) console.log(`CSS Rule: ${rule.selector}`);
    try {
      selectorParser((selectors) => {
        selectors.walkPseudos((pseudo) => {
          if (pseudo.value === ':has') {
            features.push({ name: ':has', key: 'nesting' });
            if (verbose) console.log('Detected :has');
          }
        });
      }).processSync(rule.selector);
    } catch (err) {
      console.error(`Error processing selector in rule: ${rule.selector}`, err.message);
    }
    rule.walkDecls((decl) => {
      if (verbose) console.log(`Declaration: ${decl.prop}`);
      if (decl.prop === 'gap') {
        features.push({ name: 'gap', key: 'flexbox-gap' });
        if (verbose) console.log('Detected gap');
      }
    });
  });
  return features;
}

program
  .version('1.0.0')
  .description('Baseline compatibility scanner')
  .argument('<path>', 'Folder to scan')
  .option('-o, --output <file>', 'Output JSON report to file')
  .option('-v, --verbose', 'Enable verbose logging')
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
          detected = detectJSFeatures(ast, options.verbose);
        } else if (file.endsWith('.css')) {
          detected = detectCSSFeatures(code, options.verbose);
        } else {
          return;
        }

        detected.forEach((feat) => {
          const featureData = webFeatures.features[feat.key];
          // Workaround for :has (nesting) being incorrectly 'low' in web-features
          const status = feat.key === 'nesting' ? 'baseline' : (featureData?.status?.baseline === 'high' ? 'baseline' : 'non-baseline');
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