/**
 * build-plugin.js — Render input.md with the full mdcomments plugin.
 * Comment footnotes render as a sidebar UI with highlights, threads, and avatars.
 */
const fs = require('fs');
const path = require('path');
const markdownIt = require('markdown-it');
const markdownItFootnote = require('markdown-it-footnote');
const markdownItMark = require('markdown-it-mark');
const mdcommentsPlugin = require('./plugin-mdcomments');

const input = fs.readFileSync(path.join(__dirname, '..', 'input.md'), 'utf-8');
const template = fs.readFileSync(path.join(__dirname, '..', 'shared', 'template.html'), 'utf-8');
const css = fs.readFileSync(path.join(__dirname, '..', 'shared', 'style-plugin.css'), 'utf-8');

const md = markdownIt({ html: true, linkify: true, typographer: true })
  .use(markdownItFootnote)
  .use(markdownItMark)
  .use(mdcommentsPlugin);

const body = md.render(input);

const html = template
  .replace('{{TITLE}}', 'mdcomments — markdown-it (plugin)')
  .replace('{{CSS}}', `<style>${css}</style>`)
  .replace('{{BODY}}', body);

const outPath = path.join(__dirname, 'output-plugin.html');
fs.writeFileSync(outPath, html, 'utf-8');
console.log(`✓ markdown-it plugin → ${outPath}`);
