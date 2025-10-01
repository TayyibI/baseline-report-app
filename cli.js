#!/usr/bin/env node
const { program } = require('commander');
const glob = require('glob');
const path = require('path');
const fs = require('fs');
const { parse: parseJS } = require('@babel/parser');
const postcss = require('postcss');
const selectorParser = require('postcss-selector-parser');
const webFeatures = require('web-features');
const { Parser } = require('json2csv');

function detectJSFeatures(ast, verbose = false) {
  const features = [];
  const detected = {
    AbortController: { found: false, line: null },
    fetch: { found: false, line: null },
    fetchWithInit: { found: false, line: null },
    PromiseAllSettled: { found: false, line: null },
    AsyncAwait: { found: false, line: null },
    IntersectionObserver: { found: false, line: null },
    ArrayAt: { found: false, line: null },
    WeakRef: { found: false, line: null },
  };

  ast.program.body.forEach((node) => {
    if (verbose) console.log(`JS Node: ${node.type} at line ${node.loc?.start?.line || 'unknown'}`);
    if (node.type === 'NewExpression' && node.callee.name === 'AbortController' && !detected.AbortController.found) {
      detected.AbortController = { found: true, line: node.loc?.start?.line || 1 };
      if (verbose) console.log(`Detected AbortController at line ${node.loc?.start?.line}`);
    } else if (node.type === 'VariableDeclaration') {
      node.declarations.forEach((decl) => {
        if (decl.init && decl.init.type === 'NewExpression' && decl.init.callee.name === 'AbortController' && !detected.AbortController.found) {
          detected.AbortController = { found: true, line: decl.loc?.start?.line || 1 };
          if (verbose) console.log(`Detected AbortController in variable at line ${decl.loc?.start?.line}`);
        }
        if (decl.init && decl.init.type === 'NewExpression' && decl.init.callee.name === 'WeakRef' && !detected.WeakRef.found) {
          detected.WeakRef = { found: true, line: decl.loc?.start?.line || 1 };
          if (verbose) console.log(`Detected WeakRef in variable at line ${decl.loc?.start?.line}`);
        }
      });
    }
    if (
      node.type === 'ExpressionStatement' &&
      node.expression.type === 'CallExpression' &&
      node.expression.callee.name === 'fetch' &&
      !detected.fetch.found
    ) {
      detected.fetch = { found: true, line: node.loc?.start?.line || 1 };
      if (verbose) console.log(`Detected fetch at line ${node.loc?.start?.line}`);
      if (node.expression.arguments.length > 1 && node.expression.arguments[1].type === 'ObjectExpression' && !detected.fetchWithInit.found) {
        detected.fetchWithInit = { found: true, line: node.loc?.start?.line || 1 };
        if (verbose) console.log(`Detected fetch with init options at line ${node.loc?.start?.line}`);
      }
    }
    if (
      node.type === 'ExpressionStatement' &&
      node.expression.type === 'CallExpression' &&
      node.expression.callee.type === 'MemberExpression' &&
      node.expression.callee.object.name === 'Promise' &&
      node.expression.callee.property.name === 'allSettled' &&
      !detected.PromiseAllSettled.found
    ) {
      detected.PromiseAllSettled = { found: true, line: node.loc?.start?.line || 1 };
      if (verbose) console.log(`Detected Promise.allSettled at line ${node.loc?.start?.line}`);
    }
    if (
      (node.type === 'FunctionDeclaration' && node.async ||
       node.type === 'ArrowFunctionExpression' && node.async ||
       node.type === 'AwaitExpression') &&
      !detected.AsyncAwait.found
    ) {
      detected.AsyncAwait = { found: true, line: node.loc?.start?.line || 1 };
      if (verbose) console.log(`Detected async/await at line ${node.loc?.start?.line}`);
    }
    if (node.type === 'NewExpression' && node.callee.name === 'IntersectionObserver' && !detected.IntersectionObserver.found) {
      detected.IntersectionObserver = { found: true, line: node.loc?.start?.line || 1 };
      if (verbose) console.log(`Detected IntersectionObserver at line ${node.loc?.start?.line}`);
    }
    if (
      node.type === 'ExpressionStatement' &&
      node.expression.type === 'CallExpression' &&
      node.expression.callee.type === 'MemberExpression' &&
      node.expression.callee.property.name === 'at' &&
      (node.expression.callee.object.type === 'ArrayExpression' || node.expression.callee.object.type === 'Identifier') &&
      !detected.ArrayAt.found
    ) {
      detected.ArrayAt = { found: true, line: node.loc?.start?.line || 1 };
      if (verbose) console.log(`Detected Array.prototype.at at line ${node.loc?.start?.line}`);
    }
    if (node.type === 'NewExpression' && node.callee.name === 'WeakRef' && !detected.WeakRef.found) {
      detected.WeakRef = { found: true, line: node.loc?.start?.line || 1 };
      if (verbose) console.log(`Detected WeakRef at line ${node.loc?.start?.line}`);
    }
  });

  if (detected.AbortController.found) features.push({ name: 'AbortController', key: 'aborting', line: detected.AbortController.line });
  if (detected.fetch.found) features.push({ name: 'fetch', key: 'fetch', line: detected.fetch.line });
  if (detected.fetchWithInit.found) features.push({ name: 'fetch with init options', key: 'fetch', line: detected.fetchWithInit.line });
  if (detected.PromiseAllSettled.found) features.push({ name: 'Promise.allSettled', key: 'promise-allsettled', line: detected.PromiseAllSettled.line });
  if (detected.AsyncAwait.found) features.push({ name: 'async/await', key: 'async-await', line: detected.AsyncAwait.line });
  if (detected.IntersectionObserver.found) features.push({ name: 'IntersectionObserver', key: 'intersection-observer', line: detected.IntersectionObserver.line });
  if (detected.ArrayAt.found) features.push({ name: 'Array.prototype.at', key: 'array-at', line: detected.ArrayAt.line });
  if (detected.WeakRef.found) features.push({ name: 'WeakRef', key: 'weak-references', line: detected.WeakRef.line });

  return features;
}

function detectCSSFeatures(css, verbose = false, file = '') {
  const features = [];
  const detected = {
    has: { found: false, line: null },
    gap: { found: false, line: null },
    aspectRatio: { found: false, line: null },
    containerQueries: { found: false, line: null },
    scrollSnap: { found: false, line: null },
    subgrid: { found: false, line: null },
  };

  let root;
  try {
    root = postcss.parse(css, { from: file });
  } catch (err) {
    throw new Error(`Invalid CSS syntax: ${err.message}`);
  }
  root.walkRules((rule) => {
    if (verbose) console.log(`CSS Rule: ${rule.selector} at line ${rule.source?.start?.line || 'unknown'}`);
    try {
      selectorParser((selectors) => {
        selectors.walkPseudos((pseudo) => {
          if (pseudo.value === ':has' && !detected.has.found) {
            detected.has = { found: true, line: pseudo.source?.start?.line || 1 };
            if (verbose) console.log(`Detected :has at line ${pseudo.source?.start?.line}`);
          }
        });
      }).processSync(rule.selector);
    } catch (err) {
      console.error(`Error parsing selector in rule: ${rule.selector} in ${file}: ${err.message}`);
    }
    rule.walkDecls((decl) => {
      if (verbose) console.log(`Declaration: ${decl.prop} at line ${decl.source?.start?.line || 'unknown'}`);
      if (decl.prop === 'gap' && !detected.gap.found) {
        detected.gap = { found: true, line: decl.source?.start?.line || 1 };
        if (verbose) console.log(`Detected gap at line ${decl.source?.start?.line}`);
      }
      if (decl.prop === 'aspect-ratio' && !detected.aspectRatio.found) {
        detected.aspectRatio = { found: true, line: decl.source?.start?.line || 1 };
        if (verbose) console.log(`Detected aspect-ratio at line ${decl.source?.start?.line}`);
      }
      if ((decl.prop === 'container-type' || decl.prop === 'container-name' || decl.prop === 'container') && !detected.containerQueries.found) {
        detected.containerQueries = { found: true, line: decl.source?.start?.line || 1 };
        if (verbose) console.log(`Detected container-queries at line ${decl.source?.start?.line}`);
      }
      if (decl.prop.startsWith('scroll-snap') && !detected.scrollSnap.found) {
        detected.scrollSnap = { found: true, line: decl.source?.start?.line || 1 };
        if (verbose) console.log(`Detected scroll-snap at line ${decl.source?.start?.line}`);
      }
      if (decl.prop === 'grid-template-columns' && decl.value.includes('subgrid') && !detected.subgrid.found) {
        detected.subgrid = { found: true, line: decl.source?.start?.line || 1 };
        if (verbose) console.log(`Detected subgrid at line ${decl.source?.start?.line}`);
      }
    });
  });

  if (detected.has.found) features.push({ name: ':has', key: 'nesting', line: detected.has.line });
  if (detected.gap.found) features.push({ name: 'gap', key: 'flexbox-gap', line: detected.gap.line });
  if (detected.aspectRatio.found) features.push({ name: 'aspect-ratio', key: 'aspect-ratio', line: detected.aspectRatio.line });
  if (detected.containerQueries.found) features.push({ name: 'container-queries', key: 'container-queries', line: detected.containerQueries.line });
  if (detected.scrollSnap.found) features.push({ name: 'scroll-snap', key: 'scroll-snap', line: detected.scrollSnap.line });
  if (detected.subgrid.found) features.push({ name: 'subgrid', key: 'subgrid', line: detected.subgrid.line });

  return features;
}

program
  .version('1.0.0')
  .description('Baseline compatibility scanner')
  .argument('<path>', 'Folder to scan')
  .option('-o, --output <file>', 'Output JSON report to file')
  .option('-v, --verbose', 'Enable verbose logging')
  .option('-f, --filter <type>', 'Filter by feature name or file type (js, css)')
  .option('-r, --report-format <format>', 'Output format (json, csv)', 'json')
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
              const ast = parseJS(code, { sourceType: 'module', errorRecovery: true, sourceFilename: file });
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

          const filtered = options.filter && !['js', 'css'].includes(options.filter)
            ? detected.filter(feat => feat.name.toLowerCase() === options.filter.toLowerCase())
            : detected;

          filtered.forEach((feat) => {
            const featureData = webFeatures.features[feat.key];
            const status = feat.key === 'nesting' || feat.key === 'subgrid' ? 'baseline' : (featureData?.status?.baseline === 'high' ? 'baseline' : 'non-baseline');
            results.push({ name: feat.name, status, file, line: feat.line || 1 });
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
            if (options.reportFormat === 'csv') {
              const fields = ['name', 'status', 'file', 'line'];
              const csvParser = new Parser({ fields });
              const csv = csvParser.parse(results);
              fs.writeFileSync(options.output, csv);
              console.log(`CSV report saved to ${options.output}`);
            } else {
              fs.writeFileSync(options.output, JSON.stringify(output, null, 2));
              console.log(`JSON report saved to ${options.output}`);
            }
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