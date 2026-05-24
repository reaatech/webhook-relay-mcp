export const SCHEMA_VERSION = 3;

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
  3: [
    `ALTER TABLE events ADD COLUMN delivery_status TEXT DEFAULT 'pending';
ALTER TABLE events ADD COLUMN retry_count INTEGER DEFAULT 0;
ALTER TABLE events ADD COLUMN last_error TEXT;
ALTER TABLE events ADD COLUMN next_retry_at TEXT;
ALTER TABLE webhook_sources ADD COLUMN last_event_at TEXT;
ALTER TABLE subscriptions ADD COLUMN name TEXT;
ALTER TABLE subscriptions ADD COLUMN description TEXT;
ALTER TABLE subscriptions ADD COLUMN labels TEXT;
CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  details TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_log_actor ON audit_log(actor);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at DESC);
ALTER TABLE subscription_events ADD COLUMN status TEXT DEFAULT 'delivered';
ALTER TABLE subscription_events ADD COLUMN attempt_count INTEGER DEFAULT 1;
ALTER TABLE subscription_events ADD COLUMN last_error TEXT;
ALTER TABLE subscription_events ADD COLUMN next_retry_at TEXT;
CREATE INDEX IF NOT EXISTS idx_events_delivery_status ON events(delivery_status);
CREATE INDEX IF NOT EXISTS idx_events_next_retry ON events(next_retry_at) WHERE next_retry_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audit_log_resource ON audit_log(resource_type, resource_id);`,
  ],
};
