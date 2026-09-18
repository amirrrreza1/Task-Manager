import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { BootstrapAdminService } from './bootstrap-admin.service';
import { PasswordService } from './password.service';
import { DemoAdminService } from './demo-admin.service';

@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({ secret: config.getOrThrow<string>('JWT_SECRET') }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, BootstrapAdminService, DemoAdminService, PasswordService],
  exports: [JwtModule, PasswordService],
})
export class AuthModule {}
