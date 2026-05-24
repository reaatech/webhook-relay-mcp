import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('metrics', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  describe('incrementCounter', () => {
    it('should increment a counter and reflect in getMetricsText', async () => {
      const { incrementCounter, getMetricsText } = await import('../src/utils/metrics.js');

      incrementCounter('webhook_received_total', { status: 'ok' });

      const text = getMetricsText();
      expect(text).toContain('# HELP webhook_received_total Total webhooks received');
      expect(text).toContain('# TYPE webhook_received_total counter');
      expect(text).toContain('webhook_received_total{status="ok"} 1');
    });

    it('should increment counter multiple times', async () => {
      const { incrementCounter, getMetricsText } = await import('../src/utils/metrics.js');

      incrementCounter('test_events', { type: 'payment' });
      incrementCounter('test_events', { type: 'payment' });
      incrementCounter('test_events', { type: 'payment' });

      const text = getMetricsText();
      expect(text).toContain('test_events{type="payment"} 3');
    });

    it('should track different label combinations separately', async () => {
      const { incrementCounter, getMetricsText } = await import('../src/utils/metrics.js');

      incrementCounter('requests', { status: '200' });
      incrementCounter('requests', { status: '200' });
      incrementCounter('requests', { status: '500' });

      const text = getMetricsText();
      expect(text).toContain('requests{status="200"} 2');
      expect(text).toContain('requests{status="500"} 1');
    });

    it('should work without labels', async () => {
      const { incrementCounter, getMetricsText } = await import('../src/utils/metrics.js');

      incrementCounter('simple_counter');

      const text = getMetricsText();
      expect(text).toContain('simple_counter 1');
    });

    it('should sort labels alphabetically', async () => {
      const { incrementCounter, getMetricsText } = await import('../src/utils/metrics.js');

      incrementCounter('labeled_counter', { z: 'last', a: 'first', m: 'middle' });

      const text = getMetricsText();
      expect(text).toContain('{a="first",m="middle",z="last"}');
    });
  });

  describe('setGauge', () => {
    it('should set a gauge value', async () => {
      const { setGauge, getMetricsText } = await import('../src/utils/metrics.js');

      setGauge('active_connections', 42);

      const text = getMetricsText();
      expect(text).toContain('active_connections 42');
    });

    it('should overwrite previous gauge value', async () => {
      const { setGauge, getMetricsText } = await import('../src/utils/metrics.js');

      setGauge('active_connections', 10);
      setGauge('active_connections', 25);

      const text = getMetricsText();
      const lines = text.split('\n').filter((l) => l.startsWith('active_connections '));
      expect(lines).toHaveLength(1);
      expect(lines[0]).toBe('active_connections 25');
    });

    it('should output correct format with HELP and TYPE', async () => {
      const { setGauge, registerMetric, getMetricsText } = await import('../src/utils/metrics.js');

      registerMetric('queue_depth', 'gauge', 'Current queue depth');
      setGauge('queue_depth', 7);

      const text = getMetricsText();
      expect(text).toContain('# HELP queue_depth Current queue depth');
      expect(text).toContain('# TYPE queue_depth gauge');
      expect(text).toContain('queue_depth 7');
    });
  });

  describe('registerMetric', () => {
    it('should register a counter metric with help text', async () => {
      const { registerMetric, incrementCounter, getMetricsText } = await import(
        '../src/utils/metrics.js'
      );

      registerMetric('custom_counter', 'counter', 'My custom counter');
      incrementCounter('custom_counter');

      const text = getMetricsText();
      expect(text).toContain('# HELP custom_counter My custom counter');
      expect(text).toContain('# TYPE custom_counter counter');
    });

    it('should register a gauge metric', async () => {
      const { registerMetric, setGauge, getMetricsText } = await import('../src/utils/metrics.js');

      registerMetric('custom_gauge', 'gauge', 'My custom gauge');
      setGauge('custom_gauge', 99);

      const text = getMetricsText();
      expect(text).toContain('# HELP custom_gauge My custom gauge');
      expect(text).toContain('# TYPE custom_gauge gauge');
      expect(text).toContain('custom_gauge 99');
    });

    it('should update help text for existing counter', async () => {
      const { registerMetric, incrementCounter, getMetricsText } = await import(
        '../src/utils/metrics.js'
      );

      incrementCounter('dynamic_counter');
      registerMetric('dynamic_counter', 'counter', 'Updated help');

      const text = getMetricsText();
      expect(text).toContain('# HELP dynamic_counter Updated help');
    });

    it('should update help text for existing gauge', async () => {
      const { registerMetric, setGauge, getMetricsText } = await import('../src/utils/metrics.js');

      setGauge('dynamic_gauge', 1);
      registerMetric('dynamic_gauge', 'gauge', 'Updated gauge help');

      const text = getMetricsText();
      expect(text).toContain('# HELP dynamic_gauge Updated gauge help');
    });
  });

  describe('getMetricsText', () => {
    it('should return Prometheus formatted text ending with newline', async () => {
      const { getMetricsText } = await import('../src/utils/metrics.js');

      const text = getMetricsText();
      expect(text.endsWith('\n')).toBe(true);
    });

    it('should produce valid Prometheus output with counters and gauges', async () => {
      const { incrementCounter, setGauge, getMetricsText } = await import(
        '../src/utils/metrics.js'
      );

      incrementCounter('webhook_received_total', { source: 'stripe' });
      setGauge('webhook_subscription_active', 5);

      const text = getMetricsText();
      const lines = text.split('\n').filter(Boolean);

      expect(lines).toContain('# HELP webhook_received_total Total webhooks received');
      expect(lines).toContain('# TYPE webhook_received_total counter');
      expect(lines).toContain('webhook_received_total{source="stripe"} 1');
      expect(lines).toContain('# HELP webhook_subscription_active Number of active subscriptions');
      expect(lines).toContain('# TYPE webhook_subscription_active gauge');
      expect(lines).toContain('webhook_subscription_active 5');
    });
  });
});
