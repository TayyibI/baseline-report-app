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
  let hasIntersectionObserver = false;
  let hasArrayAt = false;

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
    if (node.type === 'NewExpression' && node.callee.name === 'IntersectionObserver') {
      hasIntersectionObserver = true;
      if (verbose) console.log('Detected IntersectionObserver');
    }
    if (
      node.type === 'ExpressionStatement' &&
      node.expression.type === 'CallExpression' &&
      node.expression.callee.type === 'MemberExpression' &&
      node.expression.callee.property.name === 'at' &&
      (node.expression.callee.object.type === 'ArrayExpression' || node.expression.callee.object.type === 'Identifier')
    ) {
      hasArrayAt = true;
      if (verbose) console.log('Detected Array.prototype.at');
    }
  });

  if (hasAbortController) features.push({ name: 'AbortController', key: 'aborting' });
  if (hasFetch) features.push({ name: 'fetch', key: 'fetch' });
  if (hasPromiseAllSettled) features.push({ name: 'Promise.allSettled', key: 'promise-allsettled' });
  if (hasAsyncAwait) features.push({ name: 'async/await', key: 'async-await' });
  if (hasIntersectionObserver) features.push({ name: 'IntersectionObserver', key: 'intersection-observer' });
  if (hasArrayAt) features.push({ name: 'Array.prototype.at', key: 'array-at' });

  return features;
}

function detectCSSFeatures(css, verbose = false, file = '') {
  const features = [];
  let root;
  try {
    root = postcss.parse(css);
  } catch (err) {
    throw new Error(`Invalid CSS syntax: ${err.message}`);
  }
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
      console.error(`Error parsing selector in rule: ${rule.selector} in ${file}: ${err.message}`);
    }
    rule.walkDecls((decl) => {
      if (verbose) console.log(`Declaration: ${decl.prop}`);
      if (decl.prop === 'gap') {
        features.push({ name: 'gap', key: 'flexbox-gap' });
        if (verbose) console.log('Detected gap');
      }
      if (decl.prop === 'aspect-ratio') {
        features.push({ name: 'aspect-ratio', key: 'aspect-ratio' });
        if (verbose) console.log('Detected aspect-ratio');
      }
      if (decl.prop === 'container-type' || decl.prop === 'container-name' || decl.prop === 'container') {
        features.push({ name: 'container-queries', key: 'css-container-queries' });
        if (verbose) console.log('Detected container-queries');
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
  .option('-f, --filter <type>', 'Filter by feature name or file type (js, css)')
  .action((folderPath, options) => {
    const fullPath = path.resolve(folderPath);
    try {
      const files = glob.sync('**/*.{js,css}', { cwd: fullPath });
      if (files.length === 0) {
        console.log('No JS/CSS files found in', fullPath);
        return;
      }

      const results = [];
      files.forEach((file) => {
        // Apply file type filter
        if (options.filter === 'js' && !file.endsWith('.js')) return;
        if (options.filter === 'css' && !file.endsWith('.css')) return;

        const filePath = path.join(fullPath, file);
        let code;
        try {
          code = fs.readFileSync(filePath, 'utf8');
        } catch (err) {
          console.error(`Error reading ${file}: ${err.message}`);
          return;
        }

        try {
          let detected;
          if (file.endsWith('.js')) {
            try {
              const ast = parseJS(code, { sourceType: 'module', errorRecovery: true });
              detected = detectJSFeatures(ast, options.verbose);
            } catch (err) {
              console.error(`Skipping ${file}: Invalid JavaScript syntax - ${err.message}`);
              return;
            }
          } else if (file.endsWith('.css')) {
            try {
              detected = detectCSSFeatures(code, options.verbose, file);
            } catch (err) {
              console.error(`Skipping ${file}: ${err.message}`);
              return;
            }
          } else {
            console.error(`Skipping ${file}: Unsupported file type`);
            return;
          }

          // Apply feature filter
          const filtered = options.filter && !['js', 'css'].includes(options.filter)
            ? detected.filter(feat => feat.name.toLowerCase() === options.filter.toLowerCase())
            : detected;

          filtered.forEach((feat) => {
            const featureData = webFeatures.features[feat.key];
            // Workaround for :has (nesting) being incorrectly 'low' in web-features
            const status = feat.key === 'nesting' ? 'baseline' : (featureData?.status?.baseline === 'high' ? 'baseline' : 'non-baseline');
            results.push({ name: feat.name, status, file });
          });
        } catch (err) {
          console.error(`Unexpected error processing ${file}: ${err.message}`);
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
          try {
            fs.writeFileSync(options.output, JSON.stringify(output, null, 2));
            console.log(`Report saved to ${options.output}`);
          } catch (err) {
            console.error(`Error saving report to ${options.output}: ${err.message}`);
          }
        }
      } else {
        console.log('No supported features detected.');
      }
    } catch (err) {
      console.error(`Error scanning directory ${fullPath}: ${err.message}`);
    }
  });

program.parse(process.argv);