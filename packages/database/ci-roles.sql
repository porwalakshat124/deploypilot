-- Disposable CI PostgreSQL only. Production Supabase already provides these roles.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
