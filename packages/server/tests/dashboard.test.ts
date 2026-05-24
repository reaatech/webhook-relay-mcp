import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/server.js';

describe('Dashboard', () => {
  const app = createApp();

  it('returns HTML with 200 status', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
  });

  it('contains dashboard title and admin label', async () => {
    const res = await request(app).get('/');
    expect(res.text).toContain('Webhook Relay MCP');
    expect(res.text).toContain('Admin Dashboard');
  });

  it('contains stat card sections', async () => {
    const res = await request(app).get('/');
    expect(res.text).toContain('Active Subscriptions');
    expect(res.text).toContain('Total Events');
    expect(res.text).toContain('Pending Events');
    expect(res.text).toContain('Registered Sources');
  });

  it('contains Webhook Sources section', async () => {
    const res = await request(app).get('/');
    expect(res.text).toContain('Webhook Sources');
    expect(res.text).toContain('Auto-refresh');
  });

  it('contains Recent Events section', async () => {
    const res = await request(app).get('/');
    expect(res.text).toContain('Recent Events');
    expect(res.text).toContain('Last 20 events');
  });

  it('contains Event Counts by Source section', async () => {
    const res = await request(app).get('/');
    expect(res.text).toContain('Event Counts by Source');
  });

  it('contains JavaScript for data loading', async () => {
    const res = await request(app).get('/');
    expect(res.text).toContain('fetchJSON');
    expect(res.text).toContain('loadData');
    expect(res.text).toContain('setInterval');
  });

  it('contains valid HTML structure', async () => {
    const res = await request(app).get('/');
    expect(res.text).toMatch(/^<!DOCTYPE html>/);
    expect(res.text).toContain('</html>');
    expect(res.text).toContain('<head>');
    expect(res.text).toContain('</head>');
    expect(res.text).toContain('<body>');
    expect(res.text).toContain('</body>');
  });

  it('contains CSS styles', async () => {
    const res = await request(app).get('/');
    expect(res.text).toContain('<style>');
    expect(res.text).toContain('</style>');
    expect(res.text).toContain('.header');
    expect(res.text).toContain('.card');
  });
});
