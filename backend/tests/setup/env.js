// Test environment configuration. Uses a dedicated PostgreSQL database (never the dev/prod one).
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL || 'postgresql://stocksense:stocksense_dev@localhost:5432/stocksense_test?schema=public';
process.env.JWT_SECRET = process.env.TEST_JWT_SECRET || 'test-only-jwt-secret-0123456789abcdefghijklmnop';
process.env.JWT_EXPIRES_IN = '1h';
process.env.BCRYPT_ROUNDS = '4';
process.env.LOGIN_RATE_LIMIT_MAX = '5';
process.env.LOGIN_RATE_LIMIT_WINDOW_MS = '60000';
process.env.API_RATE_LIMIT_MAX = '100000';
process.env.LOG_REQUESTS = 'false';
