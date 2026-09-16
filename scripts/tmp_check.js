const fs = require('fs');
const content = fs.readFileSync('d:\\document-tracking-system\\document-tracking-system\\frontend\\src\\users\\pages\\UserDocuments.tsx', 'utf8');

let stack = [];
const regex = /<div|<\/div/g;
let match;
let pos = 0;

while ((match = regex.exec(content)) !== null) {
    const line = content.substring(0, match.index).split('\n').length;
    if (match[0] === '<div') {
        stack.push(line);
    } else {
        if (stack.length === 0) {
            console.log(`Extra closing </div> at line ${line}`);
        } else {
            stack.pop();
        }
    }
}

if (stack.length > 0) {
    console.log(`Unclosed <div>s at lines: ${stack.join(', ')}`);
} else {
    console.log('All <div>s balanced.');
}
