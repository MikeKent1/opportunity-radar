import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const htmlFiles = [];

function walk(directory) {
  for (const item of fs.readdirSync(directory)) {
    const fullPath = path.join(directory, item);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      if (item !== 'node_modules') walk(fullPath);
      continue;
    }
    if (item.endsWith('.html')) htmlFiles.push(fullPath);
  }
}

walk(root);

const broken = [];

for (const file of htmlFiles) {
  const text = fs.readFileSync(file, 'utf8');
  for (const match of text.matchAll(/(?:href|src)="([^"]+)"/g)) {
    const url = match[1];
    if (/^(https?:|mailto:|#)/.test(url)) continue;

    const target = path.normalize(path.join(path.dirname(file), url));
    const exists = fs.existsSync(target) || fs.existsSync(path.join(target, 'index.html'));
    if (!exists) {
      broken.push({
        file: path.relative(root, file),
        url,
        target: path.relative(root, target),
      });
    }
  }
}

console.log(
  JSON.stringify(
    {
      html: htmlFiles.length,
      broken,
    },
    null,
    2,
  ),
);

if (broken.length > 0) process.exit(1);
