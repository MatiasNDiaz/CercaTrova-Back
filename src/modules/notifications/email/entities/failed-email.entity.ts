// src/modules/notifications/email/entities/failed-email.entity.ts
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

// (F4): registro de emails que fallaron definitivamente tras los
// reintentos con backoff de EmailService. Queda consultable para
// diagnóstico o reenvío manual (por SQL o un futuro endpoint admin).
@Entity('failed_emails')
export class FailedEmail {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  to: string;

  @Column()
  subject: string;

  // Mensaje de error del último intento (respuesta de SendGrid si la hay)
  @Column({ type: 'text', nullable: true })
  error: string;

  // Cantidad de intentos realizados antes de darse por vencido
  @Column({ default: 1 })
  attempts: number;

  @CreateDateColumn()
  createdAt: Date;
}
