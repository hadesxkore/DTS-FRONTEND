const fs = require('fs');
const path = 'd:\\document-tracking-system\\document-tracking-system\\frontend\\src\\users\\pages\\UserDocuments.tsx';
const content = fs.readFileSync(path, 'utf8');
const open = (content.match(/<div/g) || []).length;
const close = (content.match(/<\/div/g) || []).length;
process.stdout.write(`Open: ${open}, Close: ${close}\n`);
