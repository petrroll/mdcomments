/**
 * build-default.js — Render input.md with markdown-it + footnote + mark plugins.
 * No mdcomments awareness — shows graceful degradation to numbered footnotes.
 */
const fs = require('fs');
const path = require('path');
const markdownIt = require('markdown-it');
const markdownItFootnote = require('markdown-it-footnote');
const markdownItMark = require('markdown-it-mark');

const input = fs.readFileSync(path.join(__dirname, '..', 'input.md'), 'utf-8');
const template = fs.readFileSync(path.join(__dirname, '..', 'shared', 'template.html'), 'utf-8');
const css = fs.readFileSync(path.join(__dirname, '..', 'shared', 'style-default.css'), 'utf-8');

const md = markdownIt({ html: true, linkify: true, typographer: true })
  .use(markdownItFootnote)
  .use(markdownItMark);

const body = md.render(input);

const html = template
  .replace('{{TITLE}}', 'mdcomments — markdown-it (default)')
  .replace('{{CSS}}', `<style>${css}</style>`)
  .replace('{{BODY}}', body);

const outPath = path.join(__dirname, 'output-default.html');
fs.writeFileSync(outPath, html, 'utf-8');
console.log(`✓ markdown-it default → ${outPath}`);
