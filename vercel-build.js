const fs = require('fs');
const path = require('path');

// Generate config.js from environment variables
const configContent = `window.config = {
  firebase: {
    apiKey:            '${process.env.FIREBASE_API_KEY}',
    authDomain:        '${process.env.FIREBASE_AUTH_DOMAIN}',
    projectId:         '${process.env.FIREBASE_PROJECT_ID}',
    storageBucket:     '${process.env.FIREBASE_STORAGE_BUCKET}',
    messagingSenderId: '${process.env.FIREBASE_MESSAGING_SENDER_ID}',
    appId:             '${process.env.FIREBASE_APP_ID}',
  },
  
  emailjs: {
    publicKey:    '${process.env.EMAILJS_PUBLIC_KEY}',
    serviceId:    '${process.env.EMAILJS_SERVICE_ID}',
    templateId:   '${process.env.EMAILJS_TEMPLATE_ID}',
    bookingEmail: '${process.env.BOOKING_EMAIL}',
  },
};`;

// Handle the directory with spaces properly
const dir = path.join(__dirname, 'Leve Beauty Bar');
const outputPath = path.join(dir, 'config.js');

// Ensure directory exists
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
}

fs.writeFileSync(outputPath, configContent);
console.log('✅ config.js generated successfully at:', outputPath);