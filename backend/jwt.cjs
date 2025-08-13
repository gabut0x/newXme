const crypto = require('crypto');

// Function untuk generate JWT secret key
function generateJWTSecret(length = 64) {
    return crypto.randomBytes(length).toString('base64');
}

function generateJWTSecretHex(length = 32) {
    return crypto.randomBytes(length).toString('hex');
}

function generateAlphanumericSecret(length = 64) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    const randomArray = crypto.randomBytes(length);
    
    for (let i = 0; i < length; i++) {
        result += chars[randomArray[i] % chars.length];
    }
    return result;
}

// Generate menggunakan crypto.randomUUID (built-in Node.js v14.17.0+)
function generateUUIDSecret() {
    return crypto.randomUUID() + crypto.randomUUID().replace(/-/g, '');
}

console.log('=== JWT SECRET KEY GENERATOR ===\n');

console.log('1. Base64 (Recommended):');
console.log(generateJWTSecret());

console.log('\n2. Hex Format:');
console.log(generateJWTSecretHex());

console.log('\n3. Alphanumeric:');
console.log(generateAlphanumericSecret());

console.log('\n4. UUID-based:');
console.log(generateUUIDSecret());

console.log('\n=== COPY SALAH SATU KEY DI ATAS ===');
console.log('Simpan di file .env sebagai:');
console.log('JWT_SECRET=your-selected-key-here');