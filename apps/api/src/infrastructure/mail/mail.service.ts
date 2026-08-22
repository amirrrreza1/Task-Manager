import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { PrismaService } from '../prisma/prisma.service';
import {
  isSmtpConfigured,
  readSmtpEnv,
  resolvePublicWebOrigin,
  type SmtpRuntimeConfig,
} from '../config/notification-env';

export interface SendEmailOptions {
  to: string;
  subject: string;
  title: string;
  lines: string[];
  actionUrl?: string;
  actionLabel?: string;
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(private readonly prisma: PrismaService) {}

  private getEnvConfig(): SmtpRuntimeConfig {
    return readSmtpEnv();
  }

  private createTransporter(smtp: SmtpRuntimeConfig): Transporter | null {
    if (!smtp.host) {
      return null;
    }

    const transportOptions: nodemailer.TransportOptions = {
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
      ...(smtp.user && smtp.password
        ? {
            auth: {
              user: smtp.user,
              pass: smtp.password,
            },
          }
        : {}),
    } as unknown as nodemailer.TransportOptions;

    return nodemailer.createTransport(transportOptions);
  }

  async testConnection(targetEmail: string): Promise<{ success: boolean; message: string }> {
    const smtp = this.getEnvConfig();
    if (!isSmtpConfigured(smtp)) {
      throw new Error('SMTP host is not configured. Set SMTP_HOST in the environment.');
    }

    const transporter = this.createTransporter(smtp);
    if (!transporter) {
      throw new Error('Could not create SMTP transporter.');
    }

    await transporter.verify();

    const fromName = smtp.fromName || 'Task Manager';
    const fromEmail = smtp.fromEmail || smtp.user || 'notifications@taskmanager.local';

    await transporter.sendMail({
      from: `"${fromName}" <${fromEmail}>`,
      to: targetEmail,
      subject: '✅ Task Manager SMTP Test Email',
      text: `Hello! This is a test email from Task Manager confirming your SMTP settings are configured correctly.\n\nTime: ${new Date().toISOString()}`,
      html: this.buildHtmlEmail({
        title: 'SMTP Connection Test',
        lines: [
          'Hello!',
          'Your SMTP settings have been configured successfully in Task Manager.',
          `Sent at: ${new Date().toUTCString()}`,
        ],
        actionLabel: 'Open Task Manager',
        actionUrl: resolvePublicWebOrigin(),
      }),
    });

    return {
      success: true,
      message: `Test email successfully sent to ${targetEmail}.`,
    };
  }

  async sendNotification(options: SendEmailOptions): Promise<boolean> {
    try {
      const flags = await this.prisma.notificationConfig.upsert({
        where: { id: 'default' },
        update: {},
        create: { id: 'default' },
      });
      const smtp = this.getEnvConfig();
      if (!flags.smtpEnabled || !isSmtpConfigured(smtp)) {
        return false;
      }

      const transporter = this.createTransporter(smtp);
      if (!transporter) {
        return false;
      }

      const fromName = smtp.fromName || 'Task Manager';
      const fromEmail = smtp.fromEmail || smtp.user || 'notifications@taskmanager.local';

      await transporter.sendMail({
        from: `"${fromName}" <${fromEmail}>`,
        to: options.to,
        subject: options.subject,
        text: `${options.title}\n\n${options.lines.join('\n')}${options.actionUrl ? `\n\nLink: ${options.actionUrl}` : ''}`,
        html: this.buildHtmlEmail({
          title: options.title,
          lines: options.lines,
          actionUrl: options.actionUrl,
          actionLabel: options.actionLabel,
        }),
      });

      return true;
    } catch (error) {
      this.logger.warn(
        `Failed to send email notification to ${options.to}: ${(error as Error).message}`,
      );
      return false;
    }
  }

  private buildHtmlEmail(params: {
    title: string;
    lines: string[];
    actionUrl?: string;
    actionLabel?: string;
  }): string {
    const linesHtml = params.lines
      .map(
        (line) =>
          `<p style="margin: 0 0 12px 0; color: #374151; font-size: 15px; line-height: 1.6;">${line}</p>`,
      )
      .join('');

    const actionButton =
      params.actionUrl && params.actionLabel
        ? `
        <div style="margin: 28px 0 12px 0; text-align: left;">
          <a href="${params.actionUrl}" target="_blank" rel="noopener noreferrer" style="background-color: #2563eb; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 600; font-size: 14px; display: inline-block; box-shadow: 0 1px 2px rgba(0,0,0,0.08);">
            ${params.actionLabel} &rarr;
          </a>
        </div>
      `
        : '';

    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${params.title}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f4f5f7; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f4f5f7; padding: 32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 580px; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05); border: 1px solid #e5e7eb;">
          <!-- Header -->
          <tr>
            <td style="padding: 24px 32px; background-color: #111827; border-bottom: 1px solid #1f2937;">
              <div style="display: flex; align-items: center;">
                <span style="color: #ffffff; font-size: 18px; font-weight: 700; letter-spacing: -0.02em;">Task Manager</span>
              </div>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding: 32px;">
              <h1 style="margin: 0 0 18px 0; color: #111827; font-size: 20px; font-weight: 700; line-height: 1.3;">
                ${params.title}
              </h1>
              ${linesHtml}
              ${actionButton}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding: 20px 32px; background-color: #f9fafb; border-top: 1px solid #e5e7eb; text-align: center;">
              <p style="margin: 0; color: #6b7280; font-size: 13px;">
                Sent automatically by Task Manager. You are receiving this because an event in your workspace triggered a notification.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `.trim();
  }
}
