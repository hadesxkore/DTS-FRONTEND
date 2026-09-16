const fs = require('fs');
const content = fs.readFileSync('d:\\document-tracking-system\\document-tracking-system\\frontend\\src\\users\\pages\\UserDocuments.tsx', 'utf8');

// Simple comment removal (won't handle all edge cases but good for many)
const cleanContent = content.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '');

let open = (cleanContent.match(/<div/g) || []).length;
let close = (cleanContent.match(/<\/div/g) || []).length;

console.log(`Open: ${open}, Close: ${close}`);
