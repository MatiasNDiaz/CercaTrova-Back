import { Injectable, InternalServerErrorException } from '@nestjs/common';
import sgMail from '@sendgrid/mail';

import { ConfigService } from '@nestjs/config';

@Injectable()
export class EmailService {
  constructor(private config: ConfigService) {

  console.log("API KEY LEÍDA:", this.config.get('SENDGRID_API_KEY'));
  sgMail.setApiKey(this.config.get<string>('SENDGRID_API_KEY')!); 

  }

async sendEmail(to: string, subject: string, html: string) {
  try {
    console.log(`[MAIL] Intentando enviar a: ${to}, subject: ${subject}`); // 👈
    const msg = {
      to,
      from: 'matidiazargentino21@gmail.com',
      subject,
      html,
    };
    await sgMail.send(msg);
    console.log(`[MAIL] ✅ Enviado correctamente a: ${to}`); // 👈
  } catch (error) {
    console.error('ERROR SENDGRID completo:', JSON.stringify(error?.response?.body ?? error, null, 2)); // 👈 más detalle
    throw new InternalServerErrorException('Error enviando email con SendGrid');
  }
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
