import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import express from 'express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HttpCatalogClient } from '../src/clients/catalog.client';
import { AppError } from '../src/utils/errors';

/** Exercises the real HTTP client against a tiny fake Catalog Service on an ephemeral port. */
let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.get('/api/v1/products/ok', (_req, res) => res.json({ data: { id: 'ok', name: 'X', variants: [] } }));
  app.get('/api/v1/products/missing', (_req, res) => res.status(404).json({ error: { code: 'NOT_FOUND', message: 'nope' } }));
  app.get('/api/v1/products/boom', (_req, res) => res.status(500).json({ error: { code: 'INTERNAL_ERROR' } }));
  app.get('/api/v1/products/slow', (_req, res) => setTimeout(() => res.json({ data: {} }), 1500));
  app.get('/api/v1/products/html', (_req, res) => res.status(200).type('html').send('<html>proxy error</html>'));
  app.post('/api/v1/inventory/sale-deductions', (req, res) => {
    if (req.body.reference === 'insufficient-ref') {
      return res.status(409).json({ error: { code: 'INSUFFICIENT_STOCK', message: 'Not enough', details: { available: 1 } } });
    }
    if (req.body.reference === 'weird-ref') return res.status(418).json({});
    return res.json({ data: { reference: req.body.reference } });
  });
  app.post('/api/v1/inventory/sale-restorations', (_req, res) => res.json({ data: { restoredLines: 1 } }));
  server = await new Promise<Server>((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

const expectAppError = async (promise: Promise<unknown>, status: number, code: string) => {
  const err = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(AppError);
  expect(err).toMatchObject({ status, code });
};

describe('HttpCatalogClient', () => {
  it('reads products and maps 404 to null', async () => {
    const client = new HttpCatalogClient(baseUrl, 1000);
    expect(await client.getProduct('ok')).toMatchObject({ id: 'ok' });
    expect(await client.getProduct('missing')).toBeNull();
  });

  it('maps stock rejections to 409 with details and success to void', async () => {
    const client = new HttpCatalogClient(baseUrl, 1000);
    await expect(client.deductStock('fine-ref-1', [])).resolves.toBeUndefined();
    const err = await client.deductStock('insufficient-ref', []).catch((e) => e);
    expect(err).toMatchObject({ status: 409, code: 'INSUFFICIENT_STOCK', details: { available: 1 } });
    await expectAppError(client.deductStock('weird-ref', []), 502, 'CATALOG_BAD_RESPONSE');
    await expect(client.restoreStock('fine-ref-1', 'why')).resolves.toBeUndefined();
  });

  it('turns downstream 5xx into 503 CATALOG_UNAVAILABLE', async () => {
    await expectAppError(new HttpCatalogClient(baseUrl, 1000).getProduct('boom'), 503, 'CATALOG_UNAVAILABLE');
  });

  it('times out slow responses', async () => {
    await expectAppError(new HttpCatalogClient(baseUrl, 200).getProduct('slow'), 503, 'CATALOG_UNAVAILABLE');
  });

  it('handles a closed port (connection refused) as unavailable', async () => {
    await expectAppError(new HttpCatalogClient('http://127.0.0.1:1', 1000).getSummary(), 503, 'CATALOG_UNAVAILABLE');
  });

  it('does not crash on non-JSON bodies', async () => {
    await expectAppError(new HttpCatalogClient(baseUrl, 1000).getProduct('html'), 502, 'CATALOG_BAD_RESPONSE');
  });
});
