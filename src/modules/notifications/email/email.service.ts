import { Injectable, InternalServerErrorException } from '@nestjs/common';
import sgMail from '@sendgrid/mail';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { FailedEmail } from './entities/failed-email.entity';

@Injectable()
export class EmailService {
  private readonly from: string;

  // (F4): reintentos con backoff antes de dar el email por perdido
  private static readonly MAX_ATTEMPTS = 3;
  private static readonly BACKOFF_MS = [500, 1500]; // delay antes del 2.º y 3.er intento

  constructor(
    private config: ConfigService,
    @InjectRepository(FailedEmail)
    private readonly failedEmailRepo: Repository<FailedEmail>,
  ) {
    // 🔒 SEGURIDAD (C9): nunca loguear la API key
    sgMail.setApiKey(this.config.get<string>('SENDGRID_API_KEY')!);

    // (B6): el remitente sale del .env — sin fallback hardcodeado.
    // Debe ser un remitente verificado en SendGrid (Gmail falla DMARC).
    const from = this.config.get<string>('EMAIL_FROM');
    if (!from) {
      throw new Error('EMAIL_FROM no está definido en el .env — abortando el arranque');
    }
    this.from = from;
  }

  async sendEmail(to: string, subject: string, html: string) {
    const msg = { to, from: this.from, subject, html };
    let lastError: unknown;

    // (F4): hasta 3 intentos con backoff corto; si todos fallan, se
    // persiste el fallo en failed_emails y recién ahí se propaga el error
    for (let attempt = 1; attempt <= EmailService.MAX_ATTEMPTS; attempt++) {
      try {
        await sgMail.send(msg);
        console.log(`[MAIL] ✅ Enviado a: ${to} (intento ${attempt})`);
        return;
      } catch (error) {
        lastError = error;
        console.error(
          `[MAIL] Intento ${attempt}/${EmailService.MAX_ATTEMPTS} fallido para ${to}:`,
          JSON.stringify((error as any)?.response?.body ?? String(error)),
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
            (lastError as any)?.response?.body ?? String(lastError),
          ),
          attempts: EmailService.MAX_ATTEMPTS,
        }),
      );
    } catch (persistError) {
      console.error('[MAIL] No se pudo registrar el email fallido:', persistError);
    }

    throw new InternalServerErrorException('Error enviando email con SendGrid');
  }

  async sendMultipleEmails(toList: string[], subject: string, html: string) {
    // 👇 En lugar de mandar todos juntos, mandamos uno por uno
    const results = await Promise.allSettled(
      toList.map(to => this.sendEmail(to, subject, html))
    );

    // Log de errores individuales sin romper todo
    results.forEach((result, i) => {
      if (result.status === 'rejected') {
        console.error(`[ERROR MAIL] No se pudo enviar a ${toList[i]}:`, result.reason);
      }
    });
  }
}
