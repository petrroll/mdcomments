/**
 * build-plugin.js — Render input.md with showdown + mdcomments extension.
 */
const fs = require('fs');
const path = require('path');
const showdown = require('showdown');
const mdcommentsExtension = require('./ext-mdcomments');

const input = fs.readFileSync(path.join(__dirname, '..', 'input.md'), 'utf-8');
const template = fs.readFileSync(path.join(__dirname, '..', 'shared', 'template.html'), 'utf-8');

// Register the extension
showdown.extension('mdcomments', mdcommentsExtension);

const converter = new showdown.Converter({
  extensions: ['mdcomments'],
  ghCompatibleHeaderId: true,
  simpleLineBreaks: false,
  tables: true,
  strikethrough: true,
});

const body = converter.makeHtml(input);

const html = template
  .replace('{{TITLE}}', 'mdcomments — Showdown (plugin)')
  .replace('{{CSS}}', '')  // CSS is injected by the extension
  .replace('{{BODY}}', body);

const outPath = path.join(__dirname, 'output-plugin.html');
fs.writeFileSync(outPath, html, 'utf-8');
console.log(`✓ showdown plugin → ${outPath}`);
