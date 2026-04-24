import "dotenv/config";
import { Client } from "pg";

async function checkDb() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    await client.connect();
    
    // Check Enum values in Postgres
    const enumRes = await client.query(`
      SELECT enumlabel 
      FROM pg_enum 
      JOIN pg_type ON pg_enum.enumtypid = pg_type.oid 
      WHERE pg_type.typname = 'Role';
    `);
    console.log("Postgres Role Enum Labels:", enumRes.rows.map(r => r.enumlabel));

    // Check Users and their roles
    const userRes = await client.query(`
      SELECT id, email, role FROM "users" LIMIT 10;
    `);
    console.log("Sample Users and Roles:", userRes.rows);

    // Check Cards and their relations
    const cardRes = await client.query(`
      SELECT c.id, c."cardId", u.role 
      FROM "cards" c
      LEFT JOIN "users" u ON c."userId" = u.id
      LIMIT 10;
    `);
    console.log("Sample Cards and associated User Roles:", cardRes.rows);

  } catch (err) {
    console.error("Database check failed:", err);
  } finally {
    await client.end();
  }
}

checkDb();
