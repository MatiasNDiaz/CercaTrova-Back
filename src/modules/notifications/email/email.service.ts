import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import sgMail from '@sendgrid/mail';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { FailedEmail } from './entities/failed-email.entity';

/**
 * Envío de emails con DOS transportes posibles.
 *
 * ## Cuál conviene para envíos masivos
 *
 * **SendGrid gana claramente**, y por eso es el transporte por defecto:
 *
 * | | SendGrid | Nodemailer / SMTP |
 * |---|---|---|
 * | Envío masivo | 1 request HTTP por **hasta 1000** destinatarios (`personalizations`) | 1 transacción SMTP **por mensaje** |
 * | 500 destinatarios | 1 llamada | 500 entregas (aun con pool) |
 * | Rate limits | pensados para transaccional en volumen | estrictos en casi todos los proveedores |
 *
 * Con `personalizations`, cada destinatario recibe un email propio: **no se ven
 * entre sí** (no es un CC masivo).
 *
 * SMTP queda disponible para quien prefiera no depender de SendGrid: se activa
 * solo si está definida `SMTP_HOST` (junto con `SMTP_PORT`, `SMTP_USER`,
 * `SMTP_PASS` y opcionalmente `SMTP_SECURE`). En ese caso el transporte usa
 * **pool de conexiones** y concurrencia limitada, que es lo mejor que se puede
 * hacer sobre SMTP.
 *
 * La elección es automática al arrancar y queda logueada, así no hay ambigüedad
 * sobre por dónde salieron los mails.
 *
 * Lo que NO cambia: los 3 intentos con backoff y el registro de los fallos
 * definitivos en `failed_emails`.
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly from: string;

  /** `null` = no hay SMTP configurado, se usa SendGrid. */
  private readonly smtp: Transporter | null = null;

  // (F4): reintentos con backoff antes de dar el email por perdido
  private static readonly MAX_ATTEMPTS = 3;
  private static readonly BACKOFF_MS = [500, 1500]; // delay antes del 2.º y 3.er intento

  /** Tope de `personalizations` por request que acepta la API de SendGrid. */
  private static readonly SENDGRID_BATCH = 1000;

  /** Entregas SMTP en paralelo. Más que esto suele chocar con el rate limit. */
  private static readonly SMTP_CONCURRENCY = 5;

  constructor(
    private config: ConfigService,
    @InjectRepository(FailedEmail)
    private readonly failedEmailRepo: Repository<FailedEmail>,
  ) {
    // (B6): el remitente sale del .env — sin fallback hardcodeado.
    const from = this.config.get<string>('EMAIL_FROM');
    if (!from) {
      throw new Error('EMAIL_FROM no está definido en el .env — abortando el arranque');
    }
    this.from = from;

    const host = this.config.get<string>('SMTP_HOST');

    if (host) {
      const port = Number(this.config.get<string>('SMTP_PORT') ?? 587);
      this.smtp = nodemailer.createTransport({
        host,
        port,
        // 465 usa TLS implícito; el resto (587/25) hace STARTTLS.
        secure: this.config.get<string>('SMTP_SECURE') === 'true' || port === 465,
        auth: {
          user: this.config.get<string>('SMTP_USER'),
          pass: this.config.get<string>('SMTP_PASS'),
        },
        // Pool: reutiliza conexiones en vez de abrir una por mensaje. Es lo
        // que más mejora el envío masivo sobre SMTP (que igual no llega ni
        // cerca del batch de SendGrid).
        pool: true,
        maxConnections: EmailService.SMTP_CONCURRENCY,
        maxMessages: 100,
      });
      this.logger.log(`Transporte de email: SMTP con pool (${host}:${port})`);
    } else {
      // 🔒 SEGURIDAD (C9): nunca loguear la API key
      sgMail.setApiKey(this.config.get<string>('SENDGRID_API_KEY')!);
      this.logger.log(
        'Transporte de email: SendGrid (definí SMTP_HOST en el .env para usar SMTP)',
      );
    }
  }

  /** Un solo intento por el transporte activo. Lanza si falla. */
  private async deliver(to: string, subject: string, html: string): Promise<void> {
    if (this.smtp) {
      await this.smtp.sendMail({ from: this.from, to, subject, html });
      return;
    }
    await sgMail.send({ to, from: this.from, subject, html });
  }

  async sendEmail(to: string, subject: string, html: string) {
    let lastError: unknown;
    const via = this.smtp ? 'SMTP' : 'SendGrid';

    // (F4): hasta 3 intentos con backoff corto; si todos fallan, se
    // persiste el fallo en failed_emails y recién ahí se propaga el error
    for (let attempt = 1; attempt <= EmailService.MAX_ATTEMPTS; attempt++) {
      try {
        await this.deliver(to, subject, html);
        this.logger.log(`✅ Enviado a ${to} vía ${via} (intento ${attempt})`);
        return;
      } catch (error) {
        lastError = error;
        this.logger.error(
          `Intento ${attempt}/${EmailService.MAX_ATTEMPTS} fallido para ${to} vía ${via}: ` +
            JSON.stringify(
              (error as { response?: { body?: unknown } })?.response?.body ?? String(error),
            ),
        );
        if (attempt < EmailService.MAX_ATTEMPTS) {
          await new Promise((r) =>
            setTimeout(r, EmailService.BACKOFF_MS[attempt - 1]),
          );
        }
      }
    }

    // Fallo definitivo: registrar para diagnóstico/reenvío manual.
    // El save no debe romper el flujo si también falla (best-effort).
    try {
      await this.failedEmailRepo.save(
        this.failedEmailRepo.create({
          to,
          subject,
          error: JSON.stringify(
            (lastError as { response?: { body?: unknown } })?.response?.body ??
              String(lastError),
          ),
          attempts: EmailService.MAX_ATTEMPTS,
        }),
      );
    } catch (persistError) {
      this.logger.error('No se pudo registrar el email fallido', persistError as Error);
    }

    throw new InternalServerErrorException(`Error enviando email vía ${via}`);
  }

  /**
   * Envío masivo.
   *
   * Antes esto hacía UNA llamada por destinatario (`toList.map(sendEmail)`),
   * cada una con hasta 3 reintentos: 100 usuarios = 100 requests HTTP. Ahora:
   *
   * · **SendGrid** → lotes de hasta 1000 destinatarios en UNA sola llamada.
   *   100 usuarios pasan de 100 requests a 1.
   * · **SMTP** → no existe el batch, así que se entrega de a
   *   `SMTP_CONCURRENCY` en paralelo sobre el pool de conexiones.
   *
   * En ambos casos, el fallo de un destinatario no tumba al resto y las
   * direcciones que no salieron quedan registradas en `failed_emails`.
   */
  async sendMultipleEmails(toList: string[], subject: string, html: string) {
    const recipients = [...new Set(toList.filter(Boolean))];
    if (recipients.length === 0) return;

    if (this.smtp) {
      await this.sendBatchOverSmtp(recipients, subject, html);
      return;
    }
    await this.sendBatchOverSendGrid(recipients, subject, html);
  }

  /** SendGrid: un request por lote de 1000, con reintentos por lote. */
  private async sendBatchOverSendGrid(recipients: string[], subject: string, html: string) {
    for (let i = 0; i < recipients.length; i += EmailService.SENDGRID_BATCH) {
      const batch = recipients.slice(i, i + EmailService.SENDGRID_BATCH);
      let lastError: unknown;
      let sent = false;

      for (let attempt = 1; attempt <= EmailService.MAX_ATTEMPTS; attempt++) {
        try {
          // `isMultiple: true` genera una `personalization` por destinatario:
          // cada uno recibe su propio email y NO ve a los demás.
          await sgMail.send({ to: batch, from: this.from, subject, html }, true);
          this.logger.log(
            `✅ Lote de ${batch.length} email(s) enviado vía SendGrid (intento ${attempt})`,
          );
          sent = true;
          break;
        } catch (error) {
          lastError = error;
          this.logger.error(
            `Lote de ${batch.length} falló (intento ${attempt}/${EmailService.MAX_ATTEMPTS}): ` +
              JSON.stringify(
                (error as { response?: { body?: unknown } })?.response?.body ?? String(error),
              ),
          );
          if (attempt < EmailService.MAX_ATTEMPTS) {
            await new Promise((r) => setTimeout(r, EmailService.BACKOFF_MS[attempt - 1]));
          }
        }
      }

      if (!sent) await this.persistFailures(batch, subject, lastError);
    }
  }

  /** SMTP: sin batch posible — de a `SMTP_CONCURRENCY` sobre el pool. */
  private async sendBatchOverSmtp(recipients: string[], subject: string, html: string) {
    for (let i = 0; i < recipients.length; i += EmailService.SMTP_CONCURRENCY) {
      const slice = recipients.slice(i, i + EmailService.SMTP_CONCURRENCY);
      const results = await Promise.allSettled(
        slice.map((to) => this.sendEmail(to, subject, html)),
      );
      results.forEach((result, j) => {
        if (result.status === 'rejected') {
          this.logger.error(`No se pudo enviar a ${slice[j]}: ${result.reason}`);
        }
      });
    }
  }

  /** Registra en `failed_emails` cada dirección de un lote que no salió. */
  private async persistFailures(recipients: string[], subject: string, lastError: unknown) {
    const error = JSON.stringify(
      (lastError as { response?: { body?: unknown } })?.response?.body ?? String(lastError),
    );
    try {
      await this.failedEmailRepo.save(
        recipients.map((to) =>
          this.failedEmailRepo.create({
            to,
            subject,
            error,
            attempts: EmailService.MAX_ATTEMPTS,
          }),
        ),
      );
    } catch (persistError) {
      this.logger.error('No se pudieron registrar los emails fallidos', persistError as Error);
    }
  }
}
