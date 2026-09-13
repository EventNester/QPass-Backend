const fs = require('fs');
const { execSync } = require('child_process');

if (fs.existsSync('./src/database/schema.prisma')) {
  execSync('prisma generate --schema=./src/database/schema.prisma', { stdio: 'inherit' });
}