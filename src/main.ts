import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { ItemQuoteLifecycle } from './item/pricing/item-quote.lifecycle.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule.forRoot());
  const lifecycle = app.get(ItemQuoteLifecycle);
  await lifecycle.start(new AbortController().signal);
  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
}

void bootstrap();
