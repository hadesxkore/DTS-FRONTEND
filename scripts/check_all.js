const fs = require('fs');
const content = fs.readFileSync('d:\\document-tracking-system\\document-tracking-system\\frontend\\src\\users\\pages\\UserDocuments.tsx', 'utf8');

function checkBalance(text, openStr, closeStr) {
    let stack = [];
    const regex = new RegExp(`${openStr}|${closeStr}`, 'g');
    let match;
    while ((match = regex.exec(text)) !== null) {
        const line = text.substring(0, match.index).split('\n').length;
        if (match[0] === openStr) {
            stack.push({ line, char: match.index });
        } else {
            if (stack.length === 0) {
                console.log(`Extra ${closeStr} at line ${line}`);
            } else {
                stack.pop();
            }
        }
    }
    stack.forEach(s => console.log(`Unclosed ${openStr} at line ${s.line}`));
}

console.log('--- Checking <div>s ---');
checkBalance(content, '<div', '</div>');
console.log('--- Checking { } ---');
// This is harder because of strings, but let's try a simple one
checkBalance(content, '{', '}');
