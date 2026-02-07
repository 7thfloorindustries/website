/**
 * Seed the first admin user.
 *
 * Usage:
 *   npx tsx scripts/seed-admin.ts --email admin@example.com --name "Admin" --password "securepassword"
 *
 * Requires DATABASE_URL in environment (or .env.local).
 */
import { neon } from '@neondatabase/serverless';
import { hash } from 'bcryptjs';

const BCRYPT_ROUNDS = 12;

function parseArgs(): { email: string; name: string; password: string } {
  const args = process.argv.slice(2);
  let email = '';
  let name = '';
  let password = '';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--email' && args[i + 1]) email = args[++i];
    else if (args[i] === '--name' && args[i + 1]) name = args[++i];
    else if (args[i] === '--password' && args[i + 1]) password = args[++i];
  }

  if (!email || !name || !password) {
    console.error('Usage: npx tsx scripts/seed-admin.ts --email <email> --name <name> --password <password>');
    process.exit(1);
  }

  if (password.length < 8) {
    console.error('Error: Password must be at least 8 characters');
    process.exit(1);
  }

  return { email: email.toLowerCase().trim(), name: name.trim(), password };
}

async function main() {
  const { email, name, password } = parseArgs();

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('Error: DATABASE_URL environment variable is not set');
    process.exit(1);
  }

  const sql = neon(connectionString);

  // Check if user already exists
  const existing = await sql`SELECT id FROM users WHERE email = ${email}`;
  if (existing.length > 0) {
    console.error(`Error: User with email "${email}" already exists`);
    process.exit(1);
  }

  const passwordHash = await hash(password, BCRYPT_ROUNDS);

  const rows = await sql`
    INSERT INTO users (email, name, password_hash, role)
    VALUES (${email}, ${name}, ${passwordHash}, 'admin')
    RETURNING id, email, name, role
  `;

  console.log('Admin user created successfully:');
  console.log(`  ID:    ${rows[0].id}`);
  console.log(`  Email: ${rows[0].email}`);
  console.log(`  Name:  ${rows[0].name}`);
  console.log(`  Role:  ${rows[0].role}`);
}

main().catch((err) => {
  console.error('Failed to seed admin user:', err);
  process.exit(1);
});
