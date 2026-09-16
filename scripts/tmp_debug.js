const fs = require('fs');
const content = fs.readFileSync('d:\\document-tracking-system\\document-tracking-system\\frontend\\src\\users\pages\\UserDocuments.tsx', 'utf8');

const regex = /<div|<\/div/g;
let stack = [];
let match;

while ((match = regex.exec(content)) !== null) {
    const line = content.substring(0, match.index).split('\n').length;
    if (match[0] === '<div') {
        stack.push({ line, match: match[0] });
    } else {
        if (stack.length === 0) {
            console.log(`Extra closing </div> at line ${line}`);
        } else {
            stack.pop();
        }
    }
}

stack.forEach(s => {
    console.log(`Unclosed <div> at line ${s.line}`);
});
