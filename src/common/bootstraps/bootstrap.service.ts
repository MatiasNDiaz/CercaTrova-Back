import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from 'src/modules/users/entities/user.entity';
import { Role } from 'src/modules/users/enums/role.enum';

@Injectable()
export class BootstrapService {
  private readonly logger = new Logger(BootstrapService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

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
    this.logger.log(`🟢 Admin creado: ${email}`);
    this.logger.log(`🟢 Admin creado: ${password}`);
  }
}
