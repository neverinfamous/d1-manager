CREATE TABLE IF NOT EXISTS products (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL, role TEXT NOT NULL, created_at TEXT NOT NULL);
INSERT INTO users (id, name, email, role, created_at) VALUES (1, 'Chris Admin', 'writenotenow@gmail.com', 'admin', '2025-10-30 08:36:59');
INSERT INTO users (id, name, email, role, created_at) VALUES (2, 'John Doe', 'john@example.com', 'user', '2025-10-30 08:36:59');
INSERT INTO users (id, name, email, role, created_at) VALUES (3, 'Jane Smith', 'jane@example.com', 'moderator', '2025-10-30 08:36:59');
INSERT INTO users (id, name, email, role, created_at) VALUES (4, 'Bob Johnson', 'bob@example.com', 'user', '2025-10-30 08:36:59');
INSERT INTO users (id, name, email, role, created_at) VALUES (5, 'Alice Williams', 'alice@example.com', 'admin', '2025-10-30 08:36:59');

