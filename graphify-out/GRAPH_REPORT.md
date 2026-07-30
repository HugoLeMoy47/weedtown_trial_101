# Graph Report - .  (2026-07-29)

## Corpus Check
- 133 files · ~88,478 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 753 nodes · 1250 edges · 44 communities (41 shown, 3 thin omitted)
- Extraction: 94% EXTRACTED · 6% INFERRED · 0% AMBIGUOUS · INFERRED: 71 edges (avg confidence: 0.53)
- Token cost: 89,704 input · 0 output

## Community Hubs (Navigation)
- Frontend UI Components
- CI Pipeline & Mobile Docs
- Express App Bootstrap
- Backend Test Suites
- Backend Dependencies
- Frontend Dependencies
- Geogrid & Nearby Feature
- Avatar Generator
- Auth Middleware & Market Stub
- Friendship & Profile Logic
- Forum Routes & Anti-Spam
- Post Routes & Reactions
- Access/WebAuthn Tests
- Reactions Library & Comments
- Chat Socket, Logging & Privacy
- Blocking & Chat Routes
- E2E Auth Specs
- Media Storage Driver
- Email Magic-Link Auth Route
- Passkey Auth Route
- Mobile App Dependencies
- Mastodon OAuth Route
- Backend Test Runner
- E2E Test Runner
- Admin Moderation Routes
- Admin Panel UI
- Report Routes & Reasons
- Notification Routes
- Test DB Reset Script
- WeedTown Logo SVG
- Moderation Core Library
- Friend Request Routes
- E2E Test Dependencies
- Prisma Client & Role Script
- Block Routes
- PWA Manifest
- Handle Validation Library
- Image Upload & Sanitization
- Notification Bell Component
- Frontend Geogrid Lib
- Mobile Screens (Frozen)
- WebAuthn RP Config
- Playwright Config
- Live Content Refresh (README)

## God Nodes (most connected - your core abstractions)
1. `useAuth()` - 27 edges
2. `api` - 25 edges
3. `log()` - 16 edges
4. `requireAuth()` - 16 edges
5. `suite()` - 13 edges
6. `Navbar()` - 13 edges
7. `scripts` - 10 edges
8. `applyReaction()` - 9 edges
9. `Integration test suite (346 tests)` - 9 edges
10. `isBlockedBetween()` - 8 edges

## Surprising Connections (you probably didn't know these)
- `HTTP client matching frontend api.js origin resolution` --semantically_similar_to--> `Deployment guidance (storage driver, backend URL)`  [INFERRED] [semantically similar]
  mobile/README.md → README.md
- `Geogrid formula parity requirement` --semantically_similar_to--> `Roadmap (Fase 1/2/3)`  [INFERRED] [semantically similar]
  mobile/README.md → README.md
- `Backend npm scripts (test/test:ci/test:smoke/test:reset)` --references--> `Backend Job: integration tests`  [EXTRACTED]
  README.md → .github/workflows/ci.yml
- `Mobile module status in architecture` --references--> `WeedTown Mobile (frozen)`  [EXTRACTED]
  README.md → mobile/README.md
- `WeedTown Web Shell (index.html)` --references--> `WeedTown (project)`  [EXTRACTED]
  frontend/public/index.html → README.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **WeedTown Badge Logo Composition** — frontend_public_logo_cannabis_leaf, frontend_public_logo_city_skyline, frontend_public_logo_swoosh, frontend_public_logo_sparks, frontend_public_logo_concentric_rings [EXTRACTED 1.00]
- **Unified multi-provider authentication (AuthProvider)** — readme_mastodon_oauth, readme_passkey_webauthn, readme_magic_link, readme_identity_handle, readme_jwt_session [EXTRACTED 1.00]
- **Community safety & moderation system** — readme_blocking, readme_moderation, readme_signup_quarantine, readme_privacy_export_delete, readme_nearby_cerca [INFERRED 0.85]
- **CI pipeline: backend tests + frontend build** — _github_workflows_ci_workflow, _github_workflows_ci_backend_job, _github_workflows_ci_frontend_job, readme_ci_integration, readme_test_suite [EXTRACTED 1.00]

## Communities (44 total, 3 thin omitted)

### Community 0 - "Frontend UI Components"
Cohesion: 0.05
Nodes (63): App(), AccessMethods(), ETIQUETAS, ICONOS, AccountPrivacy(), AvatarStudio(), semillaDeUrl(), urlDe() (+55 more)

### Community 1 - "CI Pipeline & Mobile Docs"
Cohesion: 0.10
Nodes (39): Backend Job: integration tests, Frontend Job: build, Generate JWT_SECRET step, Ephemeral Postgres 16 service, CI Workflow (GitHub Actions), Nunito Font (Google Fonts), WeedTown Web Shell (index.html), Deletion note (rm -rf mobile, no CI/deps) (+31 more)

### Community 2 - "Express App Bootstrap"
Cohesion: 0.06
Nodes (30): { allowedOrigins }, apiLimiter, app, authLimiter, cors, emailLimiter, { errorHandler }, express (+22 more)

### Community 3 - "Backend Test Suites"
Cohesion: 0.07
Nodes (21): fs, path, PNG_1PX, storage, { suite }, UPLOADS, { suite }, { suite } (+13 more)

### Community 4 - "Backend Dependencies"
Cohesion: 0.06
Nodes (31): dependencies, cors, dotenv, express, express-rate-limit, helmet, jsonwebtoken, morgan (+23 more)

### Community 5 - "Frontend Dependencies"
Cohesion: 0.07
Nodes (29): browserslist, development, production, dependencies, axios, @emotion/react, @emotion/styled, @fontsource/roboto (+21 more)

### Community 6 - "Geogrid & Nearby Feature"
Cohesion: 0.09
Nodes (23): cellDistanceKm(), centroid(), isValidCell(), LAT_CELLS, LON_CELLS, neighborsGrid(), parse(), { blockedWith, isBlockedBetween } (+15 more)

### Community 7 - "Avatar Generator"
Cohesion: 0.11
Nodes (22): ACCESORIOS, BASES, BOCAS, CABEZA, color(), crypto, esSemillaValida(), esUrlDeAvatar() (+14 more)

### Community 8 - "Auth Middleware & Market Stub"
Cohesion: 0.11
Nodes (20): estaEstablecida(), getTokenPayload(), jwt, optionalAuth(), prisma, requireAuth(), requireEstablished(), requireNotSuspended() (+12 more)

### Community 9 - "Friendship & Profile Logic"
Cohesion: 0.10
Nodes (18): areFriends(), findRequestBetween(), friendIds(), friendStatusBetween(), prisma, romperVinculo(), avatar, express (+10 more)

### Community 10 - "Forum Routes & Anti-Spam"
Cohesion: 0.11
Nodes (18): contarEnlaces(), demasiadosEnlaces(), esContenidoRepetido(), prisma, soloVisible, { blockedWith, isBlockedBetween, excludeBlocked }, { demasiadosEnlaces, esContenidoRepetido, MAX_LINKS_PER_CONTENT }, express (+10 more)

### Community 11 - "Post Routes & Reactions"
Cohesion: 0.10
Nodes (18): summarizeReactions(), serializeForumComment(), serializeForumPost(), { areFriends, friendIds }, { blockedWith, isBlockedBetween, excludeBlocked }, commentInclude, { demasiadosEnlaces, esContenidoRepetido, MAX_LINKS_PER_CONTENT }, express (+10 more)

### Community 12 - "Access/WebAuthn Tests"
Cohesion: 0.15
Nodes (12): { crearLlave, responderRegistro, responderLogin }, crypto, jwt, { suite, BASE }, authenticatorData(), clientDataJSON(), coseDeClavePublica(), crearLlave() (+4 more)

### Community 13 - "Reactions Library & Comments"
Cohesion: 0.16
Nodes (16): emptyCounts(), prisma, REACTION_SCORE, REACTION_TYPES, reactionCounts(), removeReaction(), targetMeta(), toggleReaction() (+8 more)

### Community 14 - "Chat Socket, Logging & Privacy"
Cohesion: 0.15
Nodes (13): alTocarLimite(), { allowedOrigins }, emitToUser(), initChatSocket(), jwt, { log }, { Server }, log() (+5 more)

### Community 15 - "Blocking & Chat Routes"
Cohesion: 0.16
Nodes (12): blockedWith(), excludeBlocked(), isBlockedBetween(), prisma, { blockedWith, isBlockedBetween }, { emitToUser }, express, findChatForUser() (+4 more)

### Community 16 - "E2E Auth Specs"
Cohesion: 0.21
Nodes (11): aceptarTerminos(), agregarPasskeyVirtual(), crearCuentaConPasskey(), crypto, sembrarEnlaceMagico(), { sembrarEnlaceMagico, aceptarTerminos }, { test, expect }, { agregarPasskeyVirtual, aceptarTerminos, crearCuentaConPasskey } (+3 more)

### Community 17 - "Media Storage Driver"
Cohesion: 0.15
Nodes (10): crypto, DRIVER, drivers, fs, local, path, removeByUrl(), removeMany() (+2 more)

### Community 18 - "Email Magic-Link Auth Route"
Cohesion: 0.14
Nodes (10): avatar, crypto, express, { generarUnico: generarHandleUnico }, jwt, { log }, mailer, { optionalAuth } (+2 more)

### Community 19 - "Passkey Auth Route"
Cohesion: 0.14
Nodes (11): avatar, crypto, express, { generarUnico: generarHandleUnico }, {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse
}, jwt, { log }, { optionalAuth } (+3 more)

### Community 20 - "Mobile App Dependencies"
Cohesion: 0.14
Nodes (13): dependencies, expo, react, react-native, main, name, private, scripts (+5 more)

### Community 21 - "Mastodon OAuth Route"
Cohesion: 0.17
Nodes (10): avatar, express, { generarUnico: generarHandleUnico }, getOrRegisterApp(), jwt, { log }, prisma, redirectUri() (+2 more)

### Community 22 - "Backend Test Runner"
Cohesion: 0.19
Nodes (12): abortar(), apagarServidor(), entornoHijo, ENV_DEV, ENV_TEST, esperarSalud(), fs, main() (+4 more)

### Community 23 - "E2E Test Runner"
Cohesion: 0.18
Nodes (11): abortar(), BACKEND, entornoBackend, ENV_TEST, esperar(), FRONTEND, fs, main() (+3 more)

### Community 24 - "Admin Moderation Routes"
Cohesion: 0.17
Nodes (9): requireRole(), autorPublico, express, MODELO_POR_TIPO, {
  MOTIVOS, MOTIVO_TEXTO, OBJETIVOS, OCULTABLES,
  esMotivoValido, registrar, avisar
}, prisma, reporteInclude, { requireAuth, requireRole } (+1 more)

### Community 25 - "Admin Panel UI"
Cohesion: 0.23
Nodes (10): Admin(), Bitacora(), Contenido(), ESTADOS, ETIQUETA_ACCION, ETIQUETA_TIPO, fecha(), MOTIVOS (+2 more)

### Community 26 - "Report Routes & Reasons"
Cohesion: 0.18
Nodes (10): MOTIVOS, OBJETIVOS, { esMotivoValido, esObjetivoValido, OBJETIVOS, MOTIVOS }, express, { log }, prisma, rateLimit, reportLimiter (+2 more)

### Community 27 - "Notification Routes"
Cohesion: 0.22
Nodes (9): MOTIVO_TEXTO, { blockedWith, excludeBlocked }, express, { MOTIVO_TEXTO }, prisma, { requireAuth }, router, serializar() (+1 more)

### Community 28 - "Test DB Reset Script"
Cohesion: 0.24
Nodes (9): abortar(), { Client }, ENV_DEV, ENV_TEST, fs, main(), path, ROOT (+1 more)

### Community 29 - "WeedTown Logo SVG"
Cohesion: 0.24
Nodes (10): Cannabis Leaf Group (cannabisLeaf), City Skyline (buildings with windows), Concentric Ring Badge Frame, Green Leaf Gradients (leaf, leafSide), Leaflet Path (pointed leaf shape), Spark Accents (4-point stars), Swoosh Curves, Swoosh Gradient (green to slate) (+2 more)

### Community 30 - "Moderation Core Library"
Cohesion: 0.22
Nodes (7): avisar(), esMotivoValido(), esObjetivoValido(), { log }, OCULTABLES, prisma, registrar()

### Community 31 - "Friend Request Routes"
Cohesion: 0.22
Nodes (8): express, { findRequestBetween }, { isBlockedBetween }, { log }, prisma, publicSelect, { requireAuth, requireEstablished }, router

### Community 32 - "E2E Test Dependencies"
Cohesion: 0.22
Nodes (8): devDependencies, dotenv, @playwright/test, name, private, scripts, test, version

### Community 33 - "Prisma Client & Role Script"
Cohesion: 0.25
Nodes (4): prisma, ROLES, prisma, { PrismaClient }

### Community 34 - "Block Routes"
Cohesion: 0.25
Nodes (7): express, { log }, prisma, publicSelect, { requireAuth }, { romperVinculo }, router

### Community 35 - "PWA Manifest"
Cohesion: 0.25
Nodes (7): background_color, display, icons, name, short_name, start_url, theme_color

### Community 36 - "Handle Validation Library"
Cohesion: 0.48
Nodes (6): esValido(), generarUnico(), motivoInvalido(), normalizar(), prisma, RESERVADOS

### Community 37 - "Image Upload & Sanitization"
Cohesion: 0.62
Nodes (5): ImagePicker(), ALLOWED_EXTENSIONS, decodeImage(), sanitizeImage(), validateImage()

### Community 38 - "Notification Bell Component"
Cohesion: 0.70
Nodes (4): describe(), NotificationBell(), recorte(), targetPath()

### Community 39 - "Frontend Geogrid Lib"
Cohesion: 0.50
Nodes (4): encodeCell(), getMyCell(), LAT_CELLS, LON_CELLS

### Community 41 - "WebAuthn RP Config"
Cohesion: 0.83
Nodes (3): frontendUrl(), origin(), rpID()

## Knowledge Gaps
- **375 isolated node(s):** `express`, `cors`, `helmet`, `rateLimit`, `morgan` (+370 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **3 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `prisma` connect `Backend Dependencies` to `Prisma Client & Role Script`?**
  _High betweenness centrality (0.046) - this node is a cross-community bridge._
- **What connects `express`, `cors`, `helmet` to the rest of the system?**
  _379 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Frontend UI Components` be split into smaller, more focused modules?**
  _Cohesion score 0.05426774483378257 - nodes in this community are weakly interconnected._
- **Should `CI Pipeline & Mobile Docs` be split into smaller, more focused modules?**
  _Cohesion score 0.09581646423751687 - nodes in this community are weakly interconnected._
- **Should `Express App Bootstrap` be split into smaller, more focused modules?**
  _Cohesion score 0.057057057057057055 - nodes in this community are weakly interconnected._
- **Should `Backend Test Suites` be split into smaller, more focused modules?**
  _Cohesion score 0.07301587301587302 - nodes in this community are weakly interconnected._
- **Should `Backend Dependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.0625 - nodes in this community are weakly interconnected._