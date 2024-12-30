import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Enable CORS
  // app.enableCors({
  //   origin: 'http://localhost:5173', // React 앱의 URL
  //   methods: 'GET,HEAD,PUT,PATCH,POST,DELETE', // 허용할 HTTP 메서드
  //   credentials: true, // 쿠키를 포함한 요청을 허용하려면 추가
  // });
  app.enableCors({
    origin: '*', // 모든 출처 허용
    methods: '*', // 모든 HTTP 메서드 허용
    credentials: true, // 쿠키 포함 요청 허용
  });

  await app.listen(3000);
}
bootstrap();