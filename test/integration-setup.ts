if (process.env.REQUIRE_DATABASE && !process.env.DATABASE_URL) {
  throw new Error(
    'DATABASE_URL is required when REQUIRE_DATABASE is enabled; integration tests must not be skipped.',
  )
}
