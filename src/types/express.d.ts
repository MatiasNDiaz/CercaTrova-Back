// src/types/express.d.ts
declare namespace Express {
  interface Request {
    user?: {
      id: number;
      email: string;
      role: string;
    };
  }
}