import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { ItemModule } from '../src/item/item.module';
import { SkuComputedPricingStrategy } from '../src/item/pricing/sku-computed-pricing.strategy';
import { SkuPricingService } from '../src/item/pricing/sku-pricing.service';
import { InMemorySkuQuoteStore } from '../src/item/pricing/sku-quote.store';
import { SKU_QUOTE_STORE } from '../src/item/pricing/sku-pricing.tokens';
import { canonicalRequestHash } from '../src/item/pricing/request-hash';
import { exampleRequest, withExample } from './quote-fixture';
import { DuplicateModeStrategy, ReplacementCostStrategy } from './replacement-pricing.strategy';

describe('ItemModule assembly', () => {
  let app: INestApplication | undefined;

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  it('resolves the real pricing service from the default module', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ItemModule.register({ quoteStore: 'memory' })],
    }).compile();
    expect(moduleRef.get(SkuPricingService)).toBeInstanceOf(SkuPricingService);
    expect(moduleRef.get(SkuComputedPricingStrategy).mode).toBe('same_base_fixed_coupon');
  });

  it('fails startup when a required pricing mode is missing', async () => {
    await expect(
      Test.createTestingModule({
        imports: [ItemModule.register({ quoteStore: 'memory', requiredModes: ['missing_mode'] })],
      }).compile(),
    ).rejects.toThrow('缺少必需的 SKU 定价策略: missing_mode');
  });

  it('fails startup when the same mode is registered twice', async () => {
    await expect(
      Test.createTestingModule({
        imports: [
          ItemModule.register({
            quoteStore: 'memory',
            strategyTypes: [SkuComputedPricingStrategy, DuplicateModeStrategy],
          }),
        ],
      }).compile(),
    ).rejects.toThrow('重复注册 SKU 定价策略: same_base_fixed_coupon');
  });

  it('runs the replacement strategy without changing the simplified pricing mode', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ItemModule.register({
          quoteStore: 'memory',
          requiredModes: ['same_base_fixed_coupon', 'replacement_cost_only'],
          strategyTypes: [SkuComputedPricingStrategy, ReplacementCostStrategy],
        }),
      ],
    }).compile();
    const service = moduleRef.get(SkuPricingService);
    const original = service.quote(exampleRequest());
    const replaced = service.quote(withExample({ mode: 'replacement_cost_only', scenario_id: 'REPLACE' }));

    expect(original.minimum_list_price).toBe('9.48');
    expect(replaced.purchase_cost).toBe('5.00');
    expect(replaced.notes).toEqual(['replacement-strategy']);
    expect(replaced.publish_authorized).toBe(false);
  });

  it('removes the pricing route when ItemModule is not imported', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    await request(app.getHttpServer()).post('/pricing/quote').send(exampleRequest()).expect(404);
  });

  it('serves the quote through the real application module', async () => {
    process.env.SKU_QUOTE_STORE = 'memory';
    const moduleRef = await Test.createTestingModule({ imports: [AppModule.forRoot()] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    const response = await request(app.getHttpServer()).post('/pricing/quote').send(exampleRequest()).expect(200);
    expect(response.body.minimum_list_price).toBe('9.48');
    expect(response.body.publish_authorized).toBe(false);

    const missing = await request(app.getHttpServer())
      .post('/pricing/quote')
      .send(withExample({ supplier_shipping: null, scenario_id: 'HTTP-MISSING' }))
      .expect(200);
    expect(missing.body.calculation_status).toBe('needs_input');
    expect(missing.body.purchase_cost).toBeNull();

    await request(app.getHttpServer()).post('/pricing/quote').send([exampleRequest()]).expect(400);
    const stored = await request(app.getHttpServer())
      .get(`/pricing/quotes/${response.body.calculation_id}`)
      .expect(200);
    expect(stored.body.scenario_id).toBe('EXAMPLE-ONLY');
    await request(app.getHttpServer()).get('/pricing/quotes/missing').expect(404);
    delete process.env.SKU_QUOTE_STORE;
  });

  it('reuses the same input and keeps a different scenario as history', async () => {
    const store = new InMemorySkuQuoteStore();
    const moduleRef = await Test.createTestingModule({
      imports: [ItemModule.register({ quoteStore: 'memory' })],
    })
      .overrideProvider(SKU_QUOTE_STORE)
      .useValue(store)
      .compile();
    const service = moduleRef.get(SkuPricingService);
    const first = service.quote(exampleRequest());
    const second = service.quote(withExample({ goods_total: '5' }));
    const changed = service.quote(withExample({ scenario_id: 'SECOND', goods_total: '5.00' }));

    expect(second.calculation_id).toBe(first.calculation_id);
    expect(second.reused).toBe(true);
    expect(first.reused).toBe(false);
    expect(service.findById(first.calculation_id)?.minimum_list_price).toBe('9.48');
    expect(changed.calculation_id).not.toBe(first.calculation_id);
    expect(service.findById(first.calculation_id)?.scenario_id).toBe('EXAMPLE-ONLY');
    expect(canonicalRequestHash(exampleRequest())).toBe(canonicalRequestHash(withExample({ goods_total: '5' })));
    await expect(Promise.resolve().then(() => store.append({
      calculationId: 'other',
      inputHash: canonicalRequestHash(exampleRequest()),
      createdAt: new Date().toISOString(),
      response: first,
    }))).rejects.toThrow('拒绝覆盖');
  });
});
