/** Server URL for creating the throwaway per-run test database (needs CREATEDB). */
export const TEST_DB_SERVER = process.env.TEST_DATABASE_SERVER_URL ?? "postgresql://naamdev:naamdev_dev@localhost:5432";
export const RZP_MOCK_PORT = 4999;
export const RZP_KEY_ID = "rzp_test_naamdev";
export const RZP_KEY_SECRET = "test_secret_naamdev_0123456789";
export const RZP_WEBHOOK_SECRET = "test_webhook_secret_naamdev";
export const DEMO_PASSWORD = "Naamdev@123";
