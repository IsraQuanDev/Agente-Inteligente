-- =============================================================
-- Database Migrations — Microservices Reto 4
-- Run once against Aurora PostgreSQL
-- =============================================================

-- ── Extensions ────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";

-- ── Users ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
    id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    email         VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    first_name    VARCHAR(100),
    last_name     VARCHAR(100),
    phone         VARCHAR(20),
    avatar_url    TEXT,
    role          VARCHAR(20)  NOT NULL DEFAULT 'customer',
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ,
    deleted_at    TIMESTAMPTZ
);

CREATE INDEX idx_users_email      ON users(email);
CREATE INDEX idx_users_deleted_at ON users(deleted_at) WHERE deleted_at IS NULL;

-- ── User Preferences ──────────────────────────
CREATE TABLE IF NOT EXISTS user_preferences (
    user_id              UUID        PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    email_notifications  BOOLEAN NOT NULL DEFAULT true,
    push_notifications   BOOLEAN NOT NULL DEFAULT true,
    order_updates        BOOLEAN NOT NULL DEFAULT true,
    promotions           BOOLEAN NOT NULL DEFAULT false,
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Products ──────────────────────────────────
CREATE TABLE IF NOT EXISTS products (
    id            UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    name          VARCHAR(255) NOT NULL,
    description   TEXT,
    price         NUMERIC(10,2) NOT NULL CHECK (price >= 0),
    stock         INTEGER       NOT NULL DEFAULT 0 CHECK (stock >= 0),
    category      VARCHAR(100),
    sku           VARCHAR(100) NOT NULL UNIQUE,
    image_url     TEXT,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ,
    deleted_at    TIMESTAMPTZ
);

CREATE INDEX idx_products_category   ON products(category);
CREATE INDEX idx_products_sku        ON products(sku);
CREATE INDEX idx_products_deleted_at ON products(deleted_at) WHERE deleted_at IS NULL;

-- ── Orders ────────────────────────────────────
CREATE TABLE IF NOT EXISTS orders (
    id               UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id          UUID         NOT NULL REFERENCES users(id),
    status           VARCHAR(20)  NOT NULL DEFAULT 'PENDING'
                       CHECK (status IN ('PENDING','CONFIRMED','PROCESSING','SHIPPED','DELIVERED','CANCELLED')),
    total            NUMERIC(10,2) NOT NULL CHECK (total >= 0),
    shipping_address JSONB,
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ,
    deleted_at       TIMESTAMPTZ
);

CREATE INDEX idx_orders_user_id    ON orders(user_id);
CREATE INDEX idx_orders_status     ON orders(status);
CREATE INDEX idx_orders_created_at ON orders(created_at DESC);

-- ── Order Items ───────────────────────────────
CREATE TABLE IF NOT EXISTS order_items (
    id          UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id    UUID         NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id  UUID         NOT NULL REFERENCES products(id),
    quantity    INTEGER      NOT NULL CHECK (quantity > 0),
    unit_price  NUMERIC(10,2) NOT NULL
);

CREATE INDEX idx_order_items_order_id ON order_items(order_id);

-- ── Payments ──────────────────────────────────
CREATE TABLE IF NOT EXISTS payments (
    id                UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id          UUID         NOT NULL REFERENCES orders(id),
    user_id           UUID         NOT NULL REFERENCES users(id),
    stripe_intent_id  VARCHAR(255) NOT NULL,
    amount            NUMERIC(10,2) NOT NULL,
    currency          VARCHAR(3)   NOT NULL DEFAULT 'usd',
    status            VARCHAR(20)  NOT NULL DEFAULT 'PENDING'
                        CHECK (status IN ('PENDING','COMPLETED','FAILED','REFUNDED')),
    created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ
);

CREATE INDEX idx_payments_order_id ON payments(order_id);
CREATE INDEX idx_payments_user_id  ON payments(user_id);
CREATE UNIQUE INDEX idx_payments_stripe_id ON payments(stripe_intent_id);

-- ── Refunds ───────────────────────────────────
CREATE TABLE IF NOT EXISTS refunds (
    id               UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    payment_id       UUID         NOT NULL REFERENCES payments(id),
    stripe_refund_id VARCHAR(255) NOT NULL,
    amount           NUMERIC(10,2) NOT NULL,
    reason           VARCHAR(255),
    status           VARCHAR(20)  NOT NULL DEFAULT 'PENDING',
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── Notifications ─────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
    id          UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type        VARCHAR(50)  NOT NULL,
    subject     VARCHAR(255),
    body        TEXT,
    read        BOOLEAN      NOT NULL DEFAULT false,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notifications_user_id    ON notifications(user_id);
CREATE INDEX idx_notifications_read       ON notifications(read) WHERE read = false;
CREATE INDEX idx_notifications_created_at ON notifications(created_at DESC);

-- ── Seed: admin user (password: Admin123!) ────
INSERT INTO users(id, email, password_hash, first_name, last_name, role)
VALUES (
    uuid_generate_v4(),
    'admin@reto4.com',
    '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN.0/m67lAqsJz2v5.0PW',
    'Admin', 'User', 'admin'
) ON CONFLICT (email) DO NOTHING;

-- ── Seed: sample products ─────────────────────
INSERT INTO products(id, name, description, price, stock, category, sku) VALUES
  (uuid_generate_v4(), 'Wireless Headphones',  'Premium noise-cancelling BT headphones', 299.99, 50,  'electronics',  'WH-NC-001'),
  (uuid_generate_v4(), 'Mechanical Keyboard',  'TKL RGB mechanical keyboard',            149.99, 30,  'electronics',  'KB-TKL-002'),
  (uuid_generate_v4(), 'Ergonomic Mouse',      'Vertical ergonomic wireless mouse',       79.99, 75,  'electronics',  'MS-ERG-003'),
  (uuid_generate_v4(), 'USB-C Hub 7-port',     'Aluminum 7-in-1 USB-C docking station',  59.99, 100, 'accessories',  'HUB-C7-004'),
  (uuid_generate_v4(), 'Laptop Stand',         'Adjustable aluminum laptop stand',        49.99, 60,  'accessories',  'STD-ALU-005')
ON CONFLICT (sku) DO NOTHING;

COMMENT ON TABLE users IS 'User accounts managed by auth-service';
COMMENT ON TABLE products IS 'Product catalog managed by product-service';
COMMENT ON TABLE orders IS 'Customer orders managed by order-service';
COMMENT ON TABLE payments IS 'Payment records managed by payment-service';
COMMENT ON TABLE notifications IS 'User notifications managed by notification-service';
