import fs from "fs"; import { neon } from "@neondatabase/serverless";
const db = neon(process.env.DATABASE_URL!); const ddl = fs.readFileSync("server/schema.sql", "utf8").split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
for (const s of ddl.split(";").map((x) => x.trim()).filter(Boolean)) await db.query(s);
console.log("schema ready");
