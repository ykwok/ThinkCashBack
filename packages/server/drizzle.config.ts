import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url:
      process.env.DATABASE_URL ??
      'postgres://thinkcashback:thinkcashback@localhost:5432/thinkcashback',
  },
  casing: 'snake_case',
});
