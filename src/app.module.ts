import { Module } from '@nestjs/common';
import { LoggerModule } from './logger/logger.module';
import { AppGateway } from './app.gateway';

@Module({
  imports: [LoggerModule],
  providers: [AppGateway], // 게이트웨이를 프로바이더로 등록
})
export class AppModule {}