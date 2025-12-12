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
      const msg = {
        to,
        from: 'nahuel132003@gmail.com', // tu remitente verificado
        subject,
        html,
      };

      await sgMail.send(msg);
    } catch (error) {
      console.error('ERROR SENDGRID:', error);
      throw new InternalServerErrorException('Error enviando email con SendGrid');
    }
  }
  
  async sendMultipleEmails(toList: string[], subject: string, html: string) {
  const msgs = toList.map(to => ({
    to,
    from: 'nahuel132003@gmail.com',
    subject,
    html
  }));

  await sgMail.send(msgs);
}

}
