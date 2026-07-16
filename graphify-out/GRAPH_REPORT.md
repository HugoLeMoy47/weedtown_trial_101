# Graph Report - .  (2026-07-16)

## Corpus Check
- Corpus is ~30,308 words - fits in a single context window. You may not need a graph.

## Summary
- 343 nodes · 551 edges · 20 communities (18 shown, 2 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 21 edges (avg confidence: 0.63)
- Token cost: 77,433 input · 5,100 output

## Community Hubs (Navigation)
- UI de Feed y Foros
- API de Reacciones y Posts
- Autenticación Mastodon OAuth
- Dependencias Frontend
- Dependencias Backend
- Marca, Tema y Navegación
- Núcleo Express y Seguridad
- Chat en Tiempo Real
- Cerca: Geohash y Zonas
- Conceptos y Arquitectura
- App Móvil Expo
- Identidad Visual del Logo
- Imágenes y Anonimización
- Manifest PWA
- Página Cerca (Cliente)
- Pantallas Móviles
- Stub Rutas Admin
- Stub Rutas Mercado
- Conceptos de Foros
- Persistencia de Datos

## God Nodes (most connected - your core abstractions)
1. `useAuth()` - 21 edges
2. `api` - 15 edges
3. `requireAuth()` - 11 edges
4. `Navbar()` - 10 edges
5. `applyReaction()` - 9 edges
6. `summarizeReactions()` - 8 edges
7. `WeedTown` - 8 edges
8. `ImagePicker()` - 7 edges
9. `toggleReaction()` - 6 edges
10. `reactionCounts()` - 6 edges

## Surprising Connections (you probably didn't know these)
- `WeedTown Admin Panel` --implements--> `Panel administrativo / moderacion`  [INFERRED]
  admin-panel/README.md → README.md
- `WeedTown Web Shell (index.html)` --conceptually_related_to--> `UI Material Design claro/oscuro`  [INFERRED]
  frontend/public/index.html → README.md
- `WeedTown Web Shell (index.html)` --references--> `WeedTown`  [EXTRACTED]
  frontend/public/index.html → README.md
- `WeedTown Admin Panel` --references--> `Arquitectura monorepo de cuatro modulos`  [EXTRACTED]
  admin-panel/README.md → README.md
- `serializeForumComment()` --calls--> `summarizeReactions()`  [EXTRACTED]
  backend/src/routes/forumRoutes.js → backend/src/lib/reactions.js

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Pilares de privacidad por diseno** — readme_identidad_federada_mastodon, readme_endurecimiento_backend, readme_cerca_descubrimiento_por_zonas [INFERRED 0.85]
- **Fase 1: Robustecer la red social** — readme_reacciones_cannabicas, readme_foros_estilo_reddit, readme_endurecimiento_backend, readme_chat_tiempo_real, readme_panel_moderacion [EXTRACTED 1.00]
- **Flujo de autenticacion federada** — readme_identidad_federada_mastodon, readme_flujo_oauth_mastodon, readme_sesion_jwt [EXTRACTED 1.00]
- **WeedTown Badge Logo Composition** — frontend_public_logo_cannabis_leaf, frontend_public_logo_city_skyline, frontend_public_logo_swoosh, frontend_public_logo_sparks, frontend_public_logo_concentric_rings [EXTRACTED 1.00]

## Communities (20 total, 2 thin omitted)

### Community 0 - "UI de Feed y Foros"
Cohesion: 0.11
Nodes (30): App(), CommentItem(), CommentSection(), CommentNode(), ForumComments(), ForumPostCard(), Navbar(), OwnerActions() (+22 more)

### Community 1 - "API de Reacciones y Posts"
Cohesion: 0.07
Nodes (37): prisma, { PrismaClient }, emptyCounts(), prisma, REACTION_SCORE, REACTION_TYPES, reactionCounts(), removeReaction() (+29 more)

### Community 2 - "Autenticación Mastodon OAuth"
Cohesion: 0.06
Nodes (33): getTokenPayload(), jwt, optionalAuth(), requireAuth(), express, getOrRegisterApp(), jwt, prisma (+25 more)

### Community 3 - "Dependencias Frontend"
Cohesion: 0.07
Nodes (28): browserslist, development, production, dependencies, axios, @emotion/react, @emotion/styled, @fontsource/roboto (+20 more)

### Community 4 - "Dependencias Backend"
Cohesion: 0.08
Nodes (25): dependencies, cors, dotenv, express, express-rate-limit, helmet, jsonwebtoken, morgan (+17 more)

### Community 5 - "Marca, Tema y Navegación"
Cohesion: 0.19
Nodes (13): BrandMark(), BrandWordmark(), LOGO_SOURCES, navLinks, describe(), NotificationBell(), targetPath(), ERROR_MESSAGES (+5 more)

### Community 6 - "Núcleo Express y Seguridad"
Cohesion: 0.12
Nodes (15): { allowedOrigins }, apiLimiter, app, authLimiter, cors, { errorHandler }, express, helmet (+7 more)

### Community 7 - "Chat en Tiempo Real"
Cohesion: 0.12
Nodes (11): origins, { allowedOrigins }, emitToUser(), jwt, { Server }, { emitToUser }, express, participantSelect (+3 more)

### Community 8 - "Cerca: Geohash y Zonas"
Cohesion: 0.18
Nodes (13): cellDistanceKm(), centroid(), decodeBounds(), encode(), neighborsGrid(), { CELL_RE, centroid, neighborsGrid, cellDistanceKm }, express, nearbyLimiter (+5 more)

### Community 9 - "Conceptos y Arquitectura"
Cohesion: 0.16
Nodes (16): WeedTown Admin Panel, Nunito Font (Google Fonts), WeedTown Web Shell (index.html), Arquitectura monorepo de cuatro modulos, Cerca: descubrimiento por zonas con privacidad, Chat 1 a 1 en tiempo real, Endurecimiento del backend, Flujo OAuth 2.0 de Mastodon (+8 more)

### Community 10 - "App Móvil Expo"
Cohesion: 0.14
Nodes (13): dependencies, expo, react, react-native, main, name, private, scripts (+5 more)

### Community 11 - "Identidad Visual del Logo"
Cohesion: 0.24
Nodes (10): Cannabis Leaf Group (cannabisLeaf), City Skyline (buildings with windows), Concentric Ring Badge Frame, Green Leaf Gradients (leaf, leafSide), Leaflet Path (pointed leaf shape), Spark Accents (4-point stars), Swoosh Curves, Swoosh Gradient (green to slate) (+2 more)

### Community 12 - "Imágenes y Anonimización"
Cohesion: 0.40
Nodes (7): ImagePicker(), PostModal(), uploadImage(), ALLOWED_EXTENSIONS, decodeImage(), sanitizeImage(), validateImage()

### Community 13 - "Manifest PWA"
Cohesion: 0.25
Nodes (7): background_color, display, icons, name, short_name, start_url, theme_color

### Community 14 - "Página Cerca (Cliente)"
Cohesion: 0.70
Nodes (3): encodeCell(), getMyCell(), Nearby()

### Community 16 - "Stub Rutas Admin"
Cohesion: 0.50
Nodes (3): express, TODO: Implementar controladores reales, router

### Community 17 - "Stub Rutas Mercado"
Cohesion: 0.50
Nodes (3): express, TODO: Implementar controladores reales en la fase de mercado, router

### Community 18 - "Conceptos de Foros"
Cohesion: 0.67
Nodes (3): Foros estilo Reddit, Notificaciones in-app, Reacciones cannabicas

## Knowledge Gaps
- **174 isolated node(s):** `express`, `cors`, `helmet`, `rateLimit`, `morgan` (+169 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **2 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `prisma` connect `Dependencias Backend` to `API de Reacciones y Posts`?**
  _High betweenness centrality (0.058) - this node is a cross-community bridge._
- **What connects `express`, `cors`, `helmet` to the rest of the system?**
  _176 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `UI de Feed y Foros` be split into smaller, more focused modules?**
  _Cohesion score 0.1081277213352685 - nodes in this community are weakly interconnected._
- **Should `API de Reacciones y Posts` be split into smaller, more focused modules?**
  _Cohesion score 0.07293868921775898 - nodes in this community are weakly interconnected._
- **Should `Autenticación Mastodon OAuth` be split into smaller, more focused modules?**
  _Cohesion score 0.05731707317073171 - nodes in this community are weakly interconnected._
- **Should `Dependencias Frontend` be split into smaller, more focused modules?**
  _Cohesion score 0.06896551724137931 - nodes in this community are weakly interconnected._
- **Should `Dependencias Backend` be split into smaller, more focused modules?**
  _Cohesion score 0.07692307692307693 - nodes in this community are weakly interconnected._