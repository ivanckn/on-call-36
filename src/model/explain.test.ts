import { afterEach, describe, expect, it, vi } from 'vitest';
import handler from '../../api/explain';
import { basePlan, CHERRIES } from './data';
import { changeFacts, checkNumbers, incidentFacts, shipmentFacts } from './explainFacts';

describe('explainable layer: facts', () => {
  it('builds facts for every shipment within the server limit', () => {
    for (const s of basePlan.shipments) expect(JSON.stringify({ kind: 'shipment', locale: 'zh', facts: shipmentFacts(basePlan, s, []) }).length).toBeLessThan(24_000);
    expect(JSON.stringify(incidentFacts(basePlan)).length).toBeLessThan(24_000);
    const diff = { changed: [], costIndexChange: -12, promisesKeptChange: 1, perishableChange: 0 };
    expect(changeFacts(basePlan, diff, 'Capacity on CX380 comes in 20% lower', null).shipmentsMoved).toBe(0);
  });

  it('carries the decision for the cherries', () => {
    const s = basePlan.shipments.find((x) => x.awb === CHERRIES)!;
    const f = shipmentFacts(basePlan, s, []);
    expect(f.decision.newFlight?.flight).toBe('CX 380');
    expect(f.decision.hoursBeforePromise).toBeGreaterThan(0);
    expect(f.decision.engineReason).toBe(s.reason);
  });
});

describe('explainable layer: number check', () => {
  const facts = { arrives: 'Tue 17 Nov 22:34', margin: 2.2, fit: 0.87, flight: 'CX 380', ratio: 0.62 };
  it('accepts numbers that come from the facts, with rounding and percentages', () => {
    expect(checkNumbers('CX 380 arrives Tue 17 Nov 22:34, 2.2h early; 87% chance it fits; ratio 62%.', facts).unverified).toEqual([]);
    expect(checkNumbers('預計 11月17日 22:34 經 CX 380 抵達，比承諾早 2.2 小時。', facts).unverified).toEqual([]);
  });
  it('flags numbers the facts do not contain', () => {
    expect(checkNumbers('It arrives 3.5h early and saves 1,200 kg.', facts).unverified).toEqual([3.5, 1200]);
  });
});

describe('explainable layer: server handler', () => {
  afterEach(() => { vi.unstubAllGlobals(); delete process.env.ANTHROPIC_API_KEY; delete process.env.HKUST_GENAI_KEY; });
  const post = (body: unknown) => handler(new Request('http://x/api/explain', { method: 'POST', body: JSON.stringify(body) }));

  it('refuses without a key and never calls out', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const res = await post({ kind: 'incident', locale: 'en', facts: { a: 1 } });
    expect(res.status).toBe(503);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('sends only the facts and the fixed instructions, and returns the text', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    const fetchSpy = vi.fn(async () => new Response(JSON.stringify({ model: 'm', content: [{ type: 'text', text: '摘要。\n- 一點' }] })));
    vi.stubGlobal('fetch', fetchSpy);
    const res = await post({ kind: 'shipment', locale: 'zh', facts: { flight: 'CX 380' } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ text: '摘要。\n- 一點', model: 'm' });
    const sent = JSON.parse((fetchSpy.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(sent.temperature).toBe(0);
    expect(sent.system).toContain('Never invent a number');
    expect(sent.system).toContain('書面語');
    expect(sent.messages[0].content).toContain('"flight":"CX 380"');
  });

  it('uses the HKUST GenAI API when its key is set', async () => {
    process.env.HKUST_GENAI_KEY = 'test-hkust';
    process.env.ANTHROPIC_API_KEY = 'test-key';
    const fetchSpy = vi.fn(async () => new Response(JSON.stringify({ model: 'gpt-4.1-mini', choices: [{ message: { content: 'Answer.\n- Point' } }] })));
    vi.stubGlobal('fetch', fetchSpy);
    const res = await post({ kind: 'incident', locale: 'en', facts: { n: 30 } });
    expect(await res.json()).toEqual({ text: 'Answer.\n- Point', model: 'gpt-4.1-mini' });
    const [url, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://hkust.azure-api.net/hkust-genai/v1/chat/completions');
    expect((init.headers as Record<string, string>)['api-key']).toBe('test-hkust');
    const sent = JSON.parse(init.body as string);
    expect(sent.messages[0].role).toBe('system');
    expect(sent.temperature).toBe(0);
  });

  it('rejects unknown kinds', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    expect((await post({ kind: 'poem', locale: 'en', facts: {} })).status).toBe(400);
  });
});
