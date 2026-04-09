import { Injectable, Logger } from "@nestjs/common";
import * as nodemailer from "nodemailer";
import {
  passwordResetTemplate,
  welcomeTemplate,
  lowStockTemplate,
  overduePayableTemplate,
} from "./templates";

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: nodemailer.Transporter | null = null;

  constructor() {
    const host = process.env.SMTP_HOST;

    if (host) {
      this.transporter = nodemailer.createTransport({
        host,
        port: parseInt(process.env.SMTP_PORT || "587"),
        secure: process.env.SMTP_SECURE === "true",
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });
    } else {
      this.logger.warn(
        "SMTP not configured — emails will be logged to console",
      );
    }
  }

  async sendEmail(to: string, subject: string, html: string): Promise<void> {
    const from =
      process.env.SMTP_FROM || "Luka System <noreply@lukapokes.com>";

    if (!this.transporter) {
      this.logger.log(`[DEV EMAIL] To: ${to} | Subject: ${subject}`);
      this.logger.log(
        `[DEV EMAIL] Body:\n${html.replace(/<[^>]+>/g, "")}`,
      );
      return;
    }

    try {
      await this.transporter.sendMail({ from, to, subject, html });
      this.logger.log(`Email sent to ${to}: ${subject}`);
    } catch (error) {
      this.logger.error(`Failed to send email to ${to}`, error);
      // Don't throw — email failures shouldn't break business logic
    }
  }

  async sendPasswordReset(email: string, resetUrl: string): Promise<void> {
    const html = passwordResetTemplate(resetUrl);
    await this.sendEmail(
      email,
      "Restablecer tu contrasena - Luka Poke House",
      html,
    );
  }

  async sendWelcome(
    email: string,
    firstName: string,
    tempPassword?: string,
  ): Promise<void> {
    const html = welcomeTemplate(firstName, tempPassword);
    await this.sendEmail(email, "Bienvenido a Luka System", html);
  }

  async sendLowStockAlert(
    email: string,
    items: {
      product: string;
      branch: string;
      current: number;
      minimum: number;
    }[],
  ): Promise<void> {
    const html = lowStockTemplate(items);
    await this.sendEmail(email, "Alerta de Stock Bajo - Luka System", html);
  }

  async sendOverduePayableAlert(
    email: string,
    payables: { supplier: string; amount: number; dueDate: string }[],
  ): Promise<void> {
    const html = overduePayableTemplate(payables);
    await this.sendEmail(
      email,
      "Cuentas por Pagar Vencidas - Luka System",
      html,
    );
  }
}
