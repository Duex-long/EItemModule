import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common';
import { SkuPricingService } from './sku-pricing.service';

/**
 * 功能：提供 SKU 定价 HTTP 接口。
 * 所属模块：ItemModule。
 * 实现接口：无。非扩展点，基类不适用。
 * 说明：控制器不选择具体策略类。
 * @see docs/modules/item.md
 */
@Controller()
export class SkuPricingController {
  constructor(private readonly skuPricingService: SkuPricingService) {}

  @Post('pricing/quote')
  @HttpCode(200)
  quote(@Body() body: unknown): ReturnType<SkuPricingService['quote']> {
    if (body === null || typeof body !== 'object' || Array.isArray(body)) {
      throw new BadRequestException({
        calculation_status: 'invalid_input',
        publish_authorized: false,
        notes: ['请求体必须是 JSON 对象'],
      });
    }
    return this.skuPricingService.quote(body as Record<string, unknown>);
  }

  @Get('pricing/quotes/:calculationId')
  find(@Param('calculationId') calculationId: string): ReturnType<SkuPricingService['quote']> {
    const found = this.skuPricingService.findById(calculationId);
    if (!found) {
      throw new NotFoundException({
        calculation_status: 'not_found',
        publish_authorized: false,
        notes: ['没有这个计算记录'],
      });
    }
    return found;
  }
}
