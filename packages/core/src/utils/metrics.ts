type MetricValue = number;

interface Counter {
  name: string;
  help: string;
  type: 'counter';
  labels: Map<string, MetricValue>;
}

interface Gauge {
  name: string;
  help: string;
  type: 'gauge';
  value: MetricValue;
}

const counters: Map<string, Counter> = new Map();
const gauges: Map<string, Gauge> = new Map();

function formatLabels(labels: Record<string, string>): string {
  const parts = Object.entries(labels)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}="${v}"`);
  return parts.length > 0 ? `{${parts.join(',')}}` : '';
}

function getCounter(name: string, help: string): Counter {
  let counter = counters.get(name);
  if (!counter) {
    counter = { name, help, type: 'counter', labels: new Map() };
    counters.set(name, counter);
  }
  return counter;
}

export function incrementCounter(name: string, labels: Record<string, string> = {}): void {
  const counter = getCounter(name, '');
  const key = formatLabels(labels);
  counter.labels.set(key, (counter.labels.get(key) ?? 0) + 1);
}

export function setGauge(name: string, value: number): void {
  let gauge = gauges.get(name);
  if (!gauge) {
    gauge = { name, help: '', type: 'gauge', value: 0 };
    gauges.set(name, gauge);
  }
  gauge.value = value;
}

export function registerMetric(name: string, type: 'counter' | 'gauge', help: string): void {
  if (type === 'counter') {
    const existing = counters.get(name);
    if (existing) {
      existing.help = help;
    } else {
      counters.set(name, { name, help, type: 'counter', labels: new Map() });
    }
  } else {
    const existing = gauges.get(name);
    if (existing) {
      existing.help = help;
    } else {
      gauges.set(name, { name, help, type: 'gauge', value: 0 });
    }
  }
}

export function getMetricsText(): string {
  const lines: string[] = [];

  const helpMap = new Map<string, string>();
  helpMap.set('webhook_received_total', 'Total webhooks received');
  helpMap.set('webhook_validation_failed_total', 'Total webhook signature validation failures');
  helpMap.set('webhook_ingested_total', 'Total webhooks successfully ingested');
  helpMap.set('webhook_delivery_total', 'Total webhook deliveries by status');
  helpMap.set('webhook_poll_total', 'Total poll requests');
  helpMap.set('webhook_subscription_active', 'Number of active subscriptions');
  helpMap.set('webhook_events_pending', 'Number of events with delivery_status=pending');

  for (const [name, counter] of counters) {
    const help = counter.help || helpMap.get(name) || '';
    lines.push(`# HELP ${name} ${help}`);
    lines.push(`# TYPE ${name} counter`);
    for (const [labels, value] of counter.labels) {
      lines.push(`${name}${labels} ${value}`);
    }
  }

  for (const [name, gauge] of gauges) {
    const help = gauge.help || helpMap.get(name) || '';
    lines.push(`# HELP ${name} ${help}`);
    lines.push(`# TYPE ${name} gauge`);
    lines.push(`${name} ${gauge.value}`);
  }

  return `${lines.join('\n')}\n`;
}
