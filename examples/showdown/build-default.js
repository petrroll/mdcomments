/**
 * build-default.js — Render input.md with showdown + built-in footnotes flavor.
 * Shows how mdcomments syntax degrades in Showdown's limited footnote parser.
 */
const fs = require('fs');
const path = require('path');
const showdown = require('showdown');

const input = fs.readFileSync(path.join(__dirname, '..', 'input.md'), 'utf-8');
const template = fs.readFileSync(path.join(__dirname, '..', 'shared', 'template.html'), 'utf-8');
const css = fs.readFileSync(path.join(__dirname, '..', 'shared', 'style-default.css'), 'utf-8');

const converter = new showdown.Converter({
  ghCompatibleHeaderId: true,
  simpleLineBreaks: false,
  tables: true,
  strikethrough: true,
});

// Enable footnotes if available (Showdown has built-in but limited support)
converter.setFlavor('github');

const body = converter.makeHtml(input);

const html = template
  .replace('{{TITLE}}', 'mdcomments — Showdown (default)')
  .replace('{{CSS}}', `<style>${css}</style>`)
  .replace('{{BODY}}', body);

const outPath = path.join(__dirname, 'output-default.html');
fs.writeFileSync(outPath, html, 'utf-8');
console.log(`✓ showdown default → ${outPath}`);
