import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  driver: "d1-http",
  schema: "./schema.ts",
  dialect: 'sqlite',
  // dbCredentials: {
  //   accountId: '1234567890',
  //   databaseId: '1234567890',
  //   token: '1234567890',
  // },
  migrations: {
    prefix: 'timestamp'
  }
})