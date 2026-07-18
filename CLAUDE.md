# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

CercaTrova-Back is a NestJS + TypeORM + PostgreSQL REST API for a real-estate platform (property listings, agent/user roles, requests for valuation, favorites, ratings, comments, notifications with email, and image uploads via Cloudinary). Comments and docstrings throughout the codebase are written in Spanish; match that convention when editing existing files.

## Commands

```bash
# Install
npm install

# Run (dev, watches for changes)
npm run start:dev

# Run (debug, watches for changes)
npm run start:debug

# Build
npm run build

# Run production build
npm run start:prod

# Lint (auto-fixes)
npm run lint

# Format
npm run format

# Unit tests (Jest, looks for *.spec.ts under src/)
npm run test
npm run test:watch
npm run test:cov

# Run a single unit test file
npx jest path/to/file.spec.ts

# e2e tests (separate Jest config at test/jest-e2e.json)
npm run test:e2e
```

Unit/integration tests live under `src/common/guards/*.spec.ts` (guards + authorization; run with `npm run test`, no DB needed). Jest maps `src/...` imports via `moduleNameMapper`. When touching guards, auth flows, or route protection, run these tests — they exist specifically to catch missing/decorative guards.

## Environment

Config is read from a `.env` file at the repo root (loaded both by `@nestjs/config`'s `ConfigModule.forRoot({ isGlobal: true })` and, separately, by a raw `dotenv.config()` call in `src/config/typeorm.config.ts` — TypeORM config is built before Nest's `ConfigModule` is ready, so it can't rely on `ConfigService`). Required variables: `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`, `DB_DATABASE`, `JWT_SECRET`, `JWT_EXPIRATION_TIME`, `ADMIN_EMAIL`/`ADMIN_PASSWORD`/`ADMIN_NAME`/`ADMIN_SURNAME`/`ADMIN_PHONE`, `CLOUDINARY_CLOUD_NAME`/`CLOUDINARY_API_KEY`/`CLOUDINARY_API_SECRET`, `SENDGRID_API_KEY`, `GOOGLE_CLIENT_ID`.

`JWT_SECRET`, `GOOGLE_CLIENT_ID`, and `EMAIL_FROM` are hard requirements: the app throws at startup if any is missing — never add fallback values for secrets/required config. Any new env var must also be added (name only, no value) to `.env.example`. `FRONTEND_URL` (optional, comma-separated origins) drives CORS, falling back to `http://localhost:3001` for local dev.

`typeOrmConfig` (`src/config/typeorm.config.ts`) has `synchronize: NODE_ENV !== 'production'` — in development the schema is auto-synced from entities on boot; in production it is disabled and real TypeORM migrations must be generated and run before any deploy (none exist yet). When adding a new entity, register it in `typeOrmConfig.entities[]` (in addition to importing its module in `app.module.ts`).

On every boot, `BootstrapService.createDefaultAdmin()` (`src/common/bootstraps/bootstrap.service.ts`, invoked from `main.ts`) upserts an admin user from `ADMIN_*` env vars if one doesn't already exist for that email.

CORS in `main.ts` reads `FRONTEND_URL` (with `credentials: true`); set it wherever the frontend origin changes instead of editing code.

## Architecture

### Module layout

Each domain lives under `src/modules/<name>/` following the standard Nest trio: `*.module.ts`, `*.controller.ts`, `*.service.ts`, plus `dto/` and `entities/` subfolders. `src/app.module.ts` is the composition root — it imports `ConfigModule`, `TypeOrmModule.forRoot(typeOrmConfig)`, and every feature module. Modules commonly import each other directly (e.g. `AuthModule` imports `UsersModule` and `NotificationModule`; `NotificationModule` imports `SearchPreferencesModule` and its own `EmailModule`) rather than going through shared interfaces — check a module's `imports` array before assuming a service is unreachable.

Cross-cutting code lives in `src/common/`:
- `guards/` — `JwtAuthGuard` and `RolesGuard`
- `decorators/` — `@Public()`, `@Roles(...)`, `@GetUser()`
- `bootstraps/` — startup seeding
- `Cloudinary/` — image upload config/service, used by `ImagesProperty` module

### Auth & authorization

There is no global auth guard — `JwtAuthGuard` and `RolesGuard` are applied per-controller or per-route via `@UseGuards(...)`, so a new controller is unprotected by default unless guards are added explicitly. Conventions seen across controllers:
- `@UseGuards(JwtAuthGuard)` at the controller level to require a valid JWT for all routes, with `@Public()` (checked in `JwtAuthGuard` via `Reflector`) to opt specific routes out.
- `@UseGuards(RolesGuard)` + `@Roles(Role.ADMIN)` (or `Role.USER`) added per-route on top of JWT auth to restrict by role. `RolesGuard` reads `request.user.role`, which is populated by `JwtStrategy`'s `validate()`.
- `@GetUser()` / `@GetUser('id')` extracts the authenticated user (or one field) from `request.user` — prefer this over reaching into `@Req()` directly.
- Every new controller MUST declare `@UseGuards(JwtAuthGuard[, RolesGuard])` explicitly (with `@Public()` for intentionally open routes). `@Roles(...)` without `RolesGuard` in `@UseGuards` is decorative and protects nothing.
- The id of the resource owner is always taken from the token (`@GetUser('id')`), never from a URL param — URL-param user ids are an IDOR.
- Session cookies are set/cleared ONLY via `setAuthCookie`/`clearAuthCookie` (`src/modules/auth/auth-cookie.helper.ts`) — never call `res.cookie`/`res.clearCookie` directly.
- `JwtStrategy.validate()` hits the DB on every request: it rejects deleted users, takes `role` from the DB (not the payload), and compares the payload's `tokenVersion` against `User.tokenVersion`. Any operation that must revoke a user's sessions calls `UsersService.incrementTokenVersion()` (logout and password change already do).
- Password hashing lives ONLY in `UsersService` (`createUser`/`updateUser`) — callers must never pre-hash. `User.password` has `select: false`; the hash is loaded exclusively through `findUserByEmailWithPassword()`, used only by login. Sensitive columns on new entities must use `select: false` too.
- Roles are defined in `src/modules/users/enums/role.enum.ts` (`Role.USER`, `Role.ADMIN`).

Google OAuth login is handled by `GoogleAuthService` (`src/modules/auth/google.auth.service.ts`) alongside standard email/password login in `AuthService`.

### Entity relationships

`Property` (`src/modules/properties/entities/property.entity.ts`) is the central entity, related to `User` (agent + optional `referredBy`), `PropertyType`, `PropertyImages`, `Rating`, `Comment`, and `Favorite`. `User` cascades deletes (`onDelete: 'CASCADE'`) to its ratings, comments, searchPreferences, notifications, and favorites — this was a deliberate fix for user-deletion errors caused by orphaned rows (see git history), so preserve cascade behavior when touching these relations.

`PropertyRequest` (distinct from `requests`/`UserSearchFeedback`) models a user submitting a property for valuation/listing by an agent, with an admin-only workflow (list all, view detail, change `status`, delete) layered on top of user-only self-service routes (`my-requests`, create). Look at `propertyRequest.controller.ts` as the reference pattern for mixed user/admin route protection on the same controller.

### Validation & request pipeline

`main.ts` installs a global `ValidationPipe` with `whitelist: true`, `forbidNonWhitelisted: true`, and `transform: true` (with implicit type conversion) — DTOs must declare `class-validator` decorators for every accepted field, and unexpected fields are rejected outright rather than silently dropped.

- Multipart endpoints that receive a DTO as a JSON string field must validate it with `JsonToDtoPipe` (`src/common/pipes/json-to-dto.pipe.ts`) — never `JSON.parse()` the body manually.
- Every image-upload interceptor must pass `imageUploadOptions` (`src/common/multer/image-upload.options.ts`): 5 MB max, `image/*` only.
- Rate limiting is global (`ThrottlerGuard` via `APP_GUARD`, 100 req/min); credential endpoints use a stricter `@Throttle` (5/min) — keep that on any new auth-like route.

### Notifications

`NotificationModule` wraps DB-persisted notifications (`notifications.service.ts`) and email delivery (`notifications/email/`, using SendGrid via `@sendgrid/mail`). It depends on `SearchPreferencesModule` to match new properties against saved user search criteria.
