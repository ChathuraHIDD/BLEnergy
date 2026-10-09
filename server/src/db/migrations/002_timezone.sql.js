export default `-- Dates such as "today" and reminder windows are evaluated in Sri Lanka time.
-- Set on the database (not per connection) so it also works through connection poolers.
DO $$
BEGIN
  EXECUTE format('ALTER DATABASE %I SET timezone TO %L', current_database(), 'Asia/Colombo');
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'Could not set database timezone (insufficient privilege)';
END $$;
`;
