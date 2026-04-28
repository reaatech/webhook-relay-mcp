export const SCHEMA_VERSION = 2;

export const SCHEMA = `
  -- Registered webhook sources
  CREATE TABLE IF NOT EXISTS webhook_sources (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    source_type TEXT NOT NULL,
    endpoint_url TEXT NOT NULL,
    signing_secret TEXT NOT NULL,
    is_active INTEGER DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  -- Normalized events
  CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    source TEXT NOT NULL,
    source_type TEXT NOT NULL,
    source_id TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    received_at TEXT NOT NULL,
    correlation_id TEXT,
    data TEXT NOT NULL,
    raw_payload TEXT NOT NULL,
    metadata TEXT,
    processed INTEGER DEFAULT 0,
    created_at TEXT NOT NULL
  );

  -- Event subscriptions
  CREATE TABLE IF NOT EXISTS subscriptions (
    id TEXT PRIMARY KEY,
    event_types TEXT NOT NULL,
    filters TEXT,
    created_at TEXT NOT NULL,
    expires_at TEXT,
    is_active INTEGER DEFAULT 1,
    last_polled_at TEXT
  );

  -- Subscription event delivery tracking
  CREATE TABLE IF NOT EXISTS subscription_events (
    id TEXT PRIMARY KEY,
    subscription_id TEXT NOT NULL,
    event_id TEXT NOT NULL,
    delivered_at TEXT,
    read_at TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (subscription_id) REFERENCES subscriptions(id) ON DELETE CASCADE,
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
  );

  -- Database schema versioning
  CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL
  );

  -- Performance indexes
  CREATE INDEX IF NOT EXISTS idx_events_type ON events(type);
  CREATE INDEX IF NOT EXISTS idx_events_source ON events(source);
  CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp DESC);
  CREATE INDEX IF NOT EXISTS idx_events_received_at ON events(received_at DESC);
  CREATE INDEX IF NOT EXISTS idx_events_source_type ON events(source, type);
  CREATE INDEX IF NOT EXISTS idx_events_correlation ON events(correlation_id) WHERE correlation_id IS NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_events_source_timestamp ON events(source, timestamp DESC);
  CREATE INDEX IF NOT EXISTS idx_events_processed ON events(processed) WHERE processed = 0;

  CREATE INDEX IF NOT EXISTS idx_subscription_events_subscription ON subscription_events(subscription_id);
  CREATE INDEX IF NOT EXISTS idx_subscription_events_event ON subscription_events(event_id);
  CREATE INDEX IF NOT EXISTS idx_subscription_events_unread ON subscription_events(subscription_id, read_at)
    WHERE read_at IS NULL;

  CREATE INDEX IF NOT EXISTS idx_subscriptions_active ON subscriptions(is_active) WHERE is_active = 1;
  CREATE INDEX IF NOT EXISTS idx_subscriptions_expires ON subscriptions(expires_at)
    WHERE expires_at IS NOT NULL;
`;

export const MIGRATIONS: Record<number, string[]> = {
  1: [SCHEMA],
  2: [
    `ALTER TABLE events ADD COLUMN webhook_id TEXT;
CREATE INDEX IF NOT EXISTS idx_events_webhook_id ON events(source, webhook_id) WHERE webhook_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_subscription_events_dedup ON subscription_events(subscription_id, event_id);`,
  ],
};
