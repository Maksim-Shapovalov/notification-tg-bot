import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const logger = new Logger('Main');

  try {
    await app.init();
    logger.log('Bot started successfully.');
  } catch (e) {
    logger.error(`Error starting the bot: ${e.message}`, e.stack);
    process.exit(1);
  }

  process.on('SIGINT', () => {
    logger.log('Shutting down the bot...');
    void app.close().then(
      () => process.exit(0),
      (error) => {
        logger.error(`Error during shutdown: ${error.message}`, error.stack);
        process.exit(1);
      },
    );
  });

  process.on('uncaughtException', (error) => {
    logger.error(`Uncaught Exception: ${error.message}`, error.stack);
  });
}
void bootstrap();
