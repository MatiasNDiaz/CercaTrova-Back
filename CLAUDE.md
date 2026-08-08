# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

CercaTrova-Back is a NestJS + TypeORM + PostgreSQL REST API for a real-estate platform. It covers property listings with image upload (Cloudinary), user/admin roles, property-valuation requests, favorites, ratings, comments with soft moderation, a social feed of ephemeral posts, in-app + email notifications (SendGrid or SMTP), anonymous site telemetry, and an admin statistics dashboard. Comments and docstrings throughout the codebase are written in Spanish; match that convention when editing existing files.

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

# Lint (auto-fixes — see the lint backlog note below before running)
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

# Migrations (TypeORM CLI, driven by src/config/data-source.ts)
npm run migration:generate -- src/migrations/<Name>
npm run migration:run
npm run migration:revert
npm run migration:show

# One-off data script: completa campos nuevos de Property en filas viejas
npm run backfill:properties
```

Unit/integration tests live under `src/common/guards/*.spec.ts` (guards + authorization; 3 suites / 14 tests, run with `npm run test`, no DB needed). Jest maps `src/...` imports via `moduleNameMapper` in `package.json`. When touching guards, auth flows, or route protection, run these tests — they exist specifically to catch missing/decorative guards.

`npm run lint` runs eslint **with `--fix`**. There is a large preexisting backlog of formatting/typing warnings (~1000 problems, mostly auto-fixable formatting); running it will produce an enormous unrelated diff. To check a change without rewriting the repo, run `npx eslint "src/**/*.ts"` instead.

## Environment

Config is read from a `.env` file at the repo root (loaded both by `@nestjs/config`'s `ConfigModule.forRoot({ isGlobal: true })` and, separately, by a raw `dotenv.config()` call in `src/config/typeorm.config.ts` — TypeORM config is built before Nest's `ConfigModule` is ready, so it can't rely on `ConfigService`).

Variables, grouped as in `.env.example`:
- **DB:** `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`, `DB_DATABASE`
- **JWT:** `JWT_SECRET`, `JWT_EXPIRATION_TIME`
- **Admin seed:** `ADMIN_EMAIL`, `ADMIN_PASSWORD` (≥12 chars), `ADMIN_NAME`, `ADMIN_SURNAME`, `ADMIN_PHONE`
- **Cloudinary:** `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`
- **Email:** `EMAIL_FROM` (required), plus **either** `SENDGRID_API_KEY` **or** the SMTP set (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_SECURE`)
- **Google OAuth:** `GOOGLE_CLIENT_ID`
- **Server:** `PORT` (defaults 3000), `NODE_ENV`, `FRONTEND_URL`

`JWT_SECRET`, `GOOGLE_CLIENT_ID`, and `EMAIL_FROM` are hard requirements: the app throws at startup if any is missing — never add fallback values for secrets/required config. Any new env var must also be added (name only, no value) to `.env.example`. `FRONTEND_URL` (optional, comma-separated origins) drives CORS, falling back to `http://localhost:3001` for local dev.

`EmailService` picks its transport at construction time: if `SMTP_HOST` is defined it uses Nodemailer with a connection pool; otherwise SendGrid. The choice is logged on boot.

`typeOrmConfig` (`src/config/typeorm.config.ts`) has `synchronize: NODE_ENV !== 'production'` — in development the schema is auto-synced from entities on boot; in production it is disabled and migrations must be run. When adding a new entity, register it in `typeOrmConfig.entities[]` (in addition to importing its module in `app.module.ts`).

### Migrations

`src/migrations/` holds the full migration set, verified to run against an empty database:

1. `InitialSchema` — creates all 18 tables from scratch. This is the **baseline**; there is no schema before it.
2. `AddNotificationType` — `notifications.type` + a one-time backfill of existing rows.
3. `AddForeignKeyIndexes` — indexes on the FK columns Postgres doesn't create automatically.
4. `UniqueSearchPreferencePerUser` — deduplicates and adds the unique index.
5. `AddPropertyCurrency` — `property.currency` (Postgres enum `ARS`/`USD`, `NOT NULL DEFAULT 'USD'`). Schema only: the default leaves existing rows correct, since the whole pre-existing catalogue was in dollars.
6. `AddPropertyImageOrder` — `property_images.order` (int) **+ a backfill** that numbers each property's gallery `0..n-1` with `ROW_NUMBER() OVER (PARTITION BY "propertyId" ORDER BY "isCover" DESC, "id" ASC)`. Without it every existing image would tie at `order = 0`.
7. `AddPropertyExpensasAndPets` — `property.expensas` (int, nullable) and `property.aptoMascotas` (bool, default false). Schema only; nothing to infer for existing rows.

Migrations 5–7 (2026-08-08) were **hand-written, not generated by the CLI, and have not yet been run against a real database** — unlike 1–4, which are verified against an empty Postgres. Run them on a copy before production, paying attention to #6, the only one that touches existing data.

The TypeORM CLI uses `src/config/data-source.ts`, which reuses `typeOrmConfig` but forces `synchronize: false`.

`src/migrations/_archivo_pre_baseline/` holds the four incremental migrations that predated the baseline. They are **outside the glob TypeORM reads** (`migrations/*.ts`, non-recursive) and never execute — kept as history only, with a README explaining the squash. Deleting that folder has no effect.

Migrations 2–4 and 6 **touch existing data**, not just schema (two UPDATE backfills, index locks, and an irreversible DELETE of duplicate search preferences). Read their docstrings before running them against an environment that already has rows.

On every boot, `BootstrapService.ensurePostgresExtensions()` runs `CREATE EXTENSION IF NOT EXISTS unaccent;` (required by the `unaccent(...)` calls in `PropertiesService.filter()`), then `createDefaultAdmin()` upserts an admin user from `ADMIN_*` env vars if one doesn't already exist for that email — aborting startup if `ADMIN_PASSWORD` is shorter than 12 characters and the admin doesn't exist yet. Both are in `src/common/bootstraps/bootstrap.service.ts`, invoked from `main.ts`.

**Managed Postgres hosting note:** if the DB connection user lacks `CREATE EXTENSION` privileges (common on managed hosting), `ensurePostgresExtensions()` logs a warning and the app still boots — but every text filter on `GET /properties/filter` (barrio/localidad/provincia/zone/direccion/search) will fail with a SQL error until a superuser runs `CREATE EXTENSION IF NOT EXISTS unaccent;` manually on that database.

CORS in `main.ts` reads `FRONTEND_URL` (with `credentials: true`); set it wherever the frontend origin changes instead of editing code.

## Architecture

### Bootstrap (`src/main.ts`)

In order: `helmet({ contentSecurityPolicy: false })` → CORS from `FRONTEND_URL` → `cookieParser()` → global `ValidationPipe` → the two `BootstrapService` tasks → `listen`. Rate limiting is not here: it's an `APP_GUARD` in `app.module.ts`.

### Module layout

Each domain lives under `src/modules/<name>/` following the standard Nest trio: `*.module.ts`, `*.controller.ts`, `*.service.ts`, plus `dto/` and `entities/` subfolders. `src/app.module.ts` is the composition root — it imports `ConfigModule`, `TypeOrmModule.forRoot(typeOrmConfig)`, `ThrottlerModule`, `ScheduleModule.forRoot()`, and every feature module. Modules commonly import each other directly (e.g. `AuthModule` imports `UsersModule` and `NotificationModule`; `NotificationModule` imports `SearchPreferencesModule` and its own `EmailModule`; `PropertiesModule` imports `TrackingModule`) rather than going through shared interfaces — check a module's `imports` array before assuming a service is unreachable.

Cross-cutting code lives in `src/common/`:
- `guards/` — `JwtAuthGuard`, `RolesGuard`, `OptionalJwtAuthGuard` (+ their `.spec.ts`)
- `decorators/` — `@Public()`, `@Roles(...)`, `@GetUser()`
- `helpers/` — `ensureExists`, `handleServiceError`, `isUniqueViolation`
- `pipes/` — `JsonToDtoPipe`
- `multer/` — `imageUploadOptions`
- `bootstraps/` — startup seeding
- `Cloudinary/` — image upload config/service

Two modules have confusingly similar names and are **not** related:
- `stats/` — the old dashboard over `user_search_feedback` (a form users fill in by hand), routes under `/stats`.
- `statistics/` — the current dashboard over the tracking tables + saved search preferences, routes under `/statistics`.

Likewise `requests/` (`UserSearchFeedback`, routes `/feedback/search`) is unrelated to `PropertyRequest/` (routes `/property-requests`).

### Auth & authorization

There is no global auth guard — `JwtAuthGuard` and `RolesGuard` are applied per-controller or per-route via `@UseGuards(...)`, so a new controller is unprotected by default unless guards are added explicitly. Conventions seen across controllers:
- `@UseGuards(JwtAuthGuard)` at the controller level to require a valid JWT for all routes, with `@Public()` (checked in `JwtAuthGuard` via `Reflector`) to opt specific routes out.
- `@UseGuards(RolesGuard)` + `@Roles(Role.ADMIN)` (or `Role.USER`) added per-route on top of JWT auth to restrict by role. `RolesGuard` reads `request.user.role`, which is populated by `JwtStrategy`'s `validate()`.
- `@GetUser()` / `@GetUser('id')` extracts the authenticated user (or one field) from `request.user` — prefer this over reaching into `@Req()` directly.
- Every new controller MUST declare `@UseGuards(JwtAuthGuard[, RolesGuard])` explicitly (with `@Public()` for intentionally open routes). **`@Roles(...)` without `RolesGuard` in `@UseGuards` is decorative and protects nothing** — this is the single most common defect in this codebase's history (C3, C4, C6, plus favorites/ratings/search-preferences found in the 2026-08 audit). When a route should be open to any logged-in user, **delete the `@Roles`** rather than leaving it inert; `comments.controller.ts` documents that decision. Never leave a `@Roles` that isn't backed by a guard.
- Use `JwtAuthGuard`, never `AuthGuard('jwt')` directly — only the former honours `@Public()`.
- The id of the resource owner is always taken from the token (`@GetUser('id')`), never from a URL param — URL-param user ids are an IDOR.
- Session cookies are set/cleared ONLY via `setAuthCookie`/`clearAuthCookie` (`src/modules/auth/auth-cookie.helper.ts`) — never call `res.cookie`/`res.clearCookie` directly. (`VisitorIdMiddleware` is the one deliberate exception: it manages the non-auth `ct_vid` cookie.)
- `JwtStrategy.validate()` hits the DB on every request: it reads the token from the `access_token` cookie, rejects deleted users, takes `role` from the DB (not the payload), and compares the payload's `tokenVersion` against `User.tokenVersion`. Any operation that must revoke a user's sessions calls `UsersService.incrementTokenVersion()` (logout and password change already do).
- Password hashing lives ONLY in `UsersService` (`createUser`/`updateUser`) — callers must never pre-hash. `User.password` has `select: false`; the hash is loaded exclusively through `findUserByEmailWithPassword()`, used only by login. Sensitive columns on new entities must use `select: false` too.
- `select: false` alone is not enough on write paths: `Object.assign(entity, dto)` re-injects the hashed password and `save()` returns it. Every `UsersService` method that saves ends with `delete saved.password` — keep that invariant on any new one.
- Public endpoints must project user fields explicitly, never load the whole `User` relation. Use the `leftJoin` + `addSelect` pattern with the module's whitelist constant: `AGENT_PUBLIC_FIELDS` in `properties.service.ts`, `USER_PUBLIC_FIELDS` in `posts.service.ts`. Loading the relation leaks `email`, `tokenVersion` and internal flags to anonymous visitors.
- Roles are defined in `src/modules/users/enums/role.enum.ts` (`Role.USER`, `Role.ADMIN`). There is no agent role — "the agent" in comments and route docs means an admin.

**`OptionalJwtAuthGuard`** exists because `JwtAuthGuard` short-circuits with `return true` on `@Public()` routes without ever running passport, leaving `request.user` empty even for a logged-in visitor. Any public route that needs to know *who* is looking must add `@UseGuards(OptionalJwtAuthGuard)` **on the method, in addition to** the class-level guard. Currently used by `GET /posts`, `GET /posts/:id`, `GET /properties/filter`, `GET /properties/:id`, and `GET /properties/:propertyId/comments`. Adding `@GetUser(...)` to a `@Public()` route without this guard silently yields `undefined`.

Google OAuth login is handled by `GoogleAuthService` (`src/modules/auth/google.auth.service.ts`), which validates `aud` against `GOOGLE_CLIENT_ID` and requires `email_verified === true`, alongside standard email/password login in `AuthService`. `User.authProvider` (`local` | `google`) records how the account was created and feeds the registrations statistic.

### Entity relationships

`Property` (`src/modules/properties/entities/property.entity.ts`) is the central entity, related to `User` (agent + optional `referredBy`), `PropertyType` (eager), `PropertyImages`, `Rating`, `Comment`, and `Favorite`. `User` cascades deletes (`onDelete: 'CASCADE'`) to its ratings, comments, searchPreferences, notifications, and favorites — this was a deliberate fix for user-deletion errors caused by orphaned rows, so preserve cascade behavior when touching these relations. `UsersService.deleteUser()` additionally deletes the user's `PropertyRequest` rows by hand before deleting the user.

`Rating` carries `@Unique(['userId', 'propertyId'])`; `Favorite` and `PostLike` use composite primary keys — in all three, the DB constraint (not just a pre-check) is what prevents duplicates under concurrency.

`PropertyRequest` models a user submitting a property for valuation/listing by an agent, with an admin-only workflow (list all, view detail, change `status`, delete) layered on top of user-only self-service routes (`my-requests`, `my-requests/:id`, create). Look at `propertyRequest.controller.ts` as the reference pattern for mixed user/admin route protection on the same controller. Status transitions are constrained by the `VALID_TRANSITIONS` map in the service (`aceptado` is terminal; `rechazado` can go back to `en_revision`); an illegal transition is a 409.

Two enum files are dead and safe to delete: `src/modules/requests/dto/enumsRequest.ts` (nothing imports it — `PropertyTypeEnum` is redefined locally in both `create-request.dto.ts` and `request.entity.ts`) and `src/modules/search-preferences/dto/enumTypeOfProperty.ts` (imported by `search-preference.entity.ts` but unused there; the entity's `typeOfProperty` is the `PropertyType` **entity**, not this enum).

### Validation & request pipeline

`main.ts` installs a global `ValidationPipe` with `whitelist: true`, `forbidNonWhitelisted: true`, and `transform: true` (with implicit type conversion) — DTOs must declare `class-validator` decorators for every accepted field, and unexpected fields are rejected outright rather than silently dropped.

- Multipart endpoints that receive a DTO as a JSON string field must validate it with `JsonToDtoPipe` (`src/common/pipes/json-to-dto.pipe.ts`) — never `JSON.parse()` the body manually. **Type the parameter as `string`, not as the DTO class**: the global pipe runs first and, given the real metatype, would try to validate the raw multipart string and always return 400. Cast to the DTO afterwards (see `properties.controller.ts` and `posts.controller.ts`).
- Before saving anything that references another entity by id, validate it with `ensureExists(repo, id, 'La entidad')` (`src/common/helpers/ensure-exists.helper.ts`) → 404, instead of letting the FK violation surface as a 500.
- In service `catch` blocks use `handleServiceError(logger, error, publicMessage)` (`src/common/helpers/handle-service-error.helper.ts`): it re-throws intentional `HttpException`s untouched and logs everything else internally — never concatenate `error.message` into a response.
- Postgres unique-constraint races are detected with `isUniqueViolation(error)` (`src/common/helpers/database-error.helper.ts`) and converted to a context-appropriate `ConflictException` (409) — except registration, which keeps the generic anti-enumeration 400.
- Failures of external services (Cloudinary, SendGrid) respond **502** with an honest non-technical message ("No pudimos procesar la imagen…"); irreversible external deletions run LAST, after the DB operation succeeded, and post-success cleanup is best-effort (log only). `PropertiesService.createWithImages()` and `PostsService.create()` both do a manual rollback if the upload fails after the row was saved.
- Every image-upload interceptor must pass `imageUploadOptions` (`src/common/multer/image-upload.options.ts`): 5 MB max, `image/*` only.
- Rate limiting is global (`ThrottlerGuard` via `APP_GUARD`, 100 req/min); credential endpoints use a stricter `@Throttle` (5/min) — keep that on any new auth-like route. The tracking endpoints override it upward (120/min) because navigation legitimately fires several events per minute.
- Route declaration order matters in Nest: literal segments must be declared **before** the `:param` route that would swallow them (`GET /ratings/mine` before `GET /ratings/:propertyId`, `PATCH /users/me` before `PATCH /users/:id`, `DELETE /favorites/all` before `DELETE /favorites/:propertyId`, `GET /properties/filter` before `GET /properties/:id`).

### Notifications & email

`NotificationModule` wraps DB-persisted notifications (`notifications.service.ts`) and email delivery (`notifications/email/`). It depends on `SearchPreferencesModule` to match new properties against saved user search criteria.

- Notifications are split by `targetRole` (`'user'` | `'admin'`). `getForUser()` filters `targetRole = 'user'` and `getForAdmin()` filters `'admin'` so the two feeds are disjoint — an admin's personal notifications and the management ones don't double-count. `GET /notifications/unread-count` resolves which feed to count from the token's role.
- Every notification also carries a `type` (`NotificationType`, `notifications/enums/`). `targetRole` decides which feed it lands in; `type` is what the frontend keys off for icon/colour/navigation — it must never go back to matching Spanish substrings in `title`. `createAdminNotification()` takes `type` as its first required parameter so the compiler forces new admin notifications to be classified; user-facing ones set it inline in `repo.create({...})`.
- `handleNewProperty()` matches the property against every saved `SearchPreference`, batches all matches into a single `save()`, then sends the per-user emails in waves of 10 (each body is different, so SendGrid's batch API can't be used). Users who matched are excluded from the subsequent global broadcast.
- Mass email respects the `User.notifyBroadcast` opt-out; the in-app notification is stored for everyone regardless.
- `EmailService.sendEmail()` retries 3 times with backoff (500 ms / 1500 ms) and persists definitive failures to the `failed_emails` table before throwing. `sendMultipleEmails()` uses SendGrid `personalizations` (up to 1000 recipients per request, recipients never see each other) or, on SMTP, waves of 5 over the connection pool.
- Notification dispatch is always fire-and-forget from the caller (`.catch(...)` on the promise) — a failed notification must never fail the business operation that triggered it.

### Posts (social feed)

`src/modules/posts/` is a feed of ephemeral admin publications: an image (built externally in Canva, so there are no structured fields) plus a short text. Users can like (toggle, transactional, with a denormalized `likesCount` updated in SQL) and comment; comments are one level deep — a reply to a reply re-parents to the root comment. `PostComment.isHidden` is soft moderation, same idea as `Comment.isHidden` on properties. `PostsCleanupService` runs a `@Cron` daily at 3am and deletes posts older than `POST_TTL_DAYS` (7), cascading to likes/comments and cleaning up Cloudinary best-effort.

Post/comment responses expose only `USER_PUBLIC_FIELDS` (`id`, `name`, `surname`, `photo`, `role`) of the author via `leftJoin` + `addSelect` — never `leftJoinAndSelect` the whole `User`.

### Tracking & statistics

`src/modules/tracking/` records anonymous telemetry. `VisitorIdMiddleware` is registered `forRoutes('*')` (from `TrackingModule`) and guarantees every request carries a `ct_vid` httpOnly cookie holding an opaque UUID — no personal data, only enough to avoid counting one visitor ten times. Read it with `getVisitorId(req)`.

Three write paths:
- `POST /tracking/visit` / `POST /tracking/duration` — called by the frontend (the latter via `navigator.sendBeacon`). Public, with their own higher `@Throttle`.
- `GET /properties/:id` — records a `PropertyView` (fire-and-forget from the controller).
- `GET /properties/filter` — records a `FilterUsage` (fire-and-forget from the controller).

`TrackingService` is written so that **nothing it does can fail or slow the request that triggered it**: every method catches its own errors and only logs. Admin activity is excluded from the metrics (`isAdmin` on visits; property views and filter usage from an admin are simply not recorded).

`src/modules/statistics/` reads those tables (plus `SearchPreference`, `Property`, `User`, `Favorite`, `Comment`, `Rating`, `PropertyRequest`) for the admin dashboard. The whole controller is `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles(Role.ADMIN)` **at class level**, so no route can be left open by accident — keep it that way when adding endpoints. Every endpoint takes `?range=day|week|month` (default `month`), resolved by `rangeToDate()`. `GET /statistics` returns all eleven sections in one call.

Two caveats encoded in the responses: `Favorite` and `Rating` have no timestamp column, so those rankings are historical and return `rangeApplies: false` for the frontend to disclose.

Note that the "searched features" section currently loads whole tables into memory (`filterRepo.find()` / `prefRepo.find()`) once per sub-metric rather than aggregating in SQL — fine while `filter_usages` is small, but it is the first thing to rewrite as that table grows.
