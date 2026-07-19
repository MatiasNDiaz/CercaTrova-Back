import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from '../../modules/users/entities/user.entity';
import { Role } from '../../modules/users/enums/role.enum';

@Injectable()
export class BootstrapService {
  private readonly logger = new Logger(BootstrapService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  // Asegura la extensión "unaccent" de Postgres, usada por los ILIKE
  // unaccent(...) de PropertiesService.filter(). Sin esto, cualquier
  // filtro de texto (barrio/localidad/provincia/zone/búsqueda libre)
  // revienta con error SQL en una DB nueva donde nadie la haya activado
  // a mano. No es fatal si falla: si el usuario de conexión no tiene
  // privilegios para crear extensiones (común en hosting gestionado),
  // se loguea un aviso claro y la app sigue arrancando — la extensión
  // queda como paso manual de setup en ese caso (ver CLAUDE.md).
  async ensurePostgresExtensions() {
    try {
      await this.userRepo.manager.query('CREATE EXTENSION IF NOT EXISTS unaccent;');
      this.logger.log('✅ Extensión "unaccent" de Postgres verificada/creada');
    } catch (error) {
      this.logger.warn(
        '⚠️ No se pudo crear la extensión "unaccent" (probablemente el usuario de la DB no tiene privilegios). ' +
        'Los filtros de búsqueda por texto (barrio/localidad/provincia/zone/search) van a fallar hasta que un ' +
        'superusuario la active manualmente con: CREATE EXTENSION IF NOT EXISTS unaccent;',
      );
    }
  }

  async createDefaultAdmin() {
    const name = process.env.ADMIN_NAME;
    const surname = process.env.ADMIN_SURNAME; // 👈 campo obligatorio
    const phone = process.env.ADMIN_PHONE; // 👈 campo obligatorio
    const email = process.env.ADMIN_EMAIL;
    const password = process.env.ADMIN_PASSWORD;

    if (!email || !password) {
      this.logger.warn('❌ Variables ADMIN_EMAIL o ADMIN_PASSWORD no definidas');
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();

    const existingAdmin = await this.userRepo.findOne({ where: { email:normalizedEmail } });
    if (existingAdmin) {
      this.logger.log('✅ Admin ya existe, no se crea uno nuevo');
      return;
    }

    // 🔒 SEGURIDAD (B3): no crear jamás un admin con password débil —
    // se aborta el arranque con un mensaje claro
    if (password.length < 12) {
      throw new Error(
        'ADMIN_PASSWORD debe tener al menos 12 caracteres — abortando el arranque. ' +
        'Definí un password fuerte en el .env antes de iniciar la app.',
      );
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const admin = this.userRepo.create({
      name,
      email: email.toLowerCase(),
      password: hashedPassword,
      surname,
      phone,
      role: Role.ADMIN,
    });

    await this.userRepo.save(admin);
    // 🔒 SEGURIDAD (C9): jamás loguear el password del admin
    this.logger.log(`🟢 Admin creado: ${email}`);
  }
}
