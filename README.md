# WeedTown 🇲🇽🌿

**WeedTown** es una red social para la **comunidad cannábica de México**: un espacio digital de **seguridad y respeto** donde la comunidad pacheca puede compartir, aprender, conectar y crecer sin estigma. Combina feed social, foros temáticos y chat, y en una fase posterior un **mercado de tangibles e intangibles diversos** (merch, arte, glass, talleres, servicios) creado por y para la comunidad.

---

## 🌱 Visión y principios

- **Seguridad primero**: la privacidad no es una feature, es la base. La identidad es **federada vía Mastodon**: WeedTown no crea contraseñas, no exige email y permite participar con el seudónimo del fediverso. Los datos personales del perfil son opcionales.
- **Respeto y comunidad**: espacio libre de estigma, con moderación orientada a proteger a las personas usuarias. La cultura cannábica mexicana es el centro: educación, reducción de riesgos, arte y cultura.
- **Legalidad**: el contenido y el futuro mercado operan dentro del marco legal mexicano. El mercado está pensado para productos y servicios lícitos de la cultura cannábica (parafernalia, merch, arte, cursos, asesorías) — **no** para la compraventa de sustancias.
- **Minimalismo funcional**: interfaz Material Design (claro/oscuro), accesible y sin fricción.

## 🎯 Prioridades

1. **Robustecer la red social** (fase actual): likes y comentarios, foros por categoría, chat en tiempo real, moderación.
2. **Mercado comunitario** (fase posterior): catálogo de tangibles e intangibles con perfiles de vendedor de la propia comunidad.

---

## 📌 Estado del proyecto

| Funcionalidad | Estado |
|---|---|
| Identidad federada con Mastodon (cualquier instancia) | ✅ Funcionando |
| Feed de posteos con texto, imagen y hashtags (paginado + búsqueda) | ✅ Funcionando |
| Perfil de usuario (ver y editar el propio, datos opcionales) | ✅ Funcionando |
| UI Material Design con modo claro/oscuro accesible | ✅ Funcionando |
| Base de datos PostgreSQL en Supabase (Prisma ORM) | ✅ Funcionando |
| Reacciones cannábicas en posts y comentarios (👍 Me gusta, 🌿 Me rola, 👀 Me interesa, 😒 Me molesta) | ✅ Funcionando |
| Comentarios en posteos | ✅ Funcionando |
| Foros con categorías | 🚧 Modelado en BD, endpoints stub — **siguiente** |
| Chat 1 a 1 en tiempo real (Socket.IO) | 🚧 Modelado en BD, endpoints stub — **siguiente** |
| Endurecimiento de seguridad (helmet, rate limit, CORS estricto) | 📋 Planificado |
| Mercado comunitario (tangibles e intangibles) | 📋 Fase posterior |
| Panel administrativo / moderación | 📋 Planificado |
| App móvil (Expo) | 🚧 Demo mínima, no conectada al flujo actual |

---

## 🧭 Arquitectura

Monorepo con cuatro módulos:

```
/weedtown
├── backend/            API REST (Express + Prisma)
│   ├── app.js          Entrada: middlewares, rutas, Swagger UI, /health
│   ├── prisma/         schema.prisma + migraciones
│   └── src/
│       ├── lib/        Cliente Prisma (singleton)
│       ├── middlewares/  errorHandler, requireAuth (JWT)
│       └── routes/     auth, posts, profile, forum*, chat*, market*, admin*  (* = stub)
├── frontend/           Web (React 18 + CRA + MUI v5 + React Router)
│   └── src/
│       ├── components/ Navbar, PostCard, PostModal, RequireAuth, ...
│       ├── hooks/      useAuth (AuthProvider + sesión en localStorage)
│       ├── pages/      Login, AuthCallback, Feed, Forum, Chat, Profile
│       ├── services/   api.js (axios con Authorization automático)
│       └── theme.js    Tema Material claro/oscuro (sistema + toggle persistido)
├── mobile/             App móvil (Expo / React Native) — demo
└── admin-panel/        Panel de moderación — pendiente
```

### Autenticación federada (Mastodon OAuth 2.0)

```mermaid
sequenceDiagram
    participant U as Usuario (navegador)
    participant F as Frontend (React)
    participant B as Backend (Express)
    participant M as Instancia Mastodon

    U->>F: Escribe su instancia (ej. mastodon.social)
    F->>B: GET /api/auth/mastodon/start?instance=...
    B->>M: POST /api/v1/apps (solo la primera vez por instancia)
    M-->>B: client_id / client_secret (se cachean en BD)
    B-->>U: 302 → pantalla de autorización de la instancia (state firmado, 10 min)
    U->>M: Autoriza la app
    M-->>B: GET /api/auth/mastodon/callback?code&state
    B->>M: POST /oauth/token + GET /verify_credentials
    B->>B: Upsert del usuario por (instancia, id de cuenta)
    B-->>U: 302 → /auth/callback#token=JWT (7 días)
    F->>F: Guarda el JWT en localStorage
    F->>B: GET /api/auth/me (Authorization: Bearer)
```

Puntos clave del diseño:
- **Multi-instancia**: la app se registra dinámicamente en cada instancia de Mastodon la primera vez que un usuario de esa instancia inicia sesión (tabla `MastodonApp`).
- **Seudonimato por diseño**: el modelo `User` no guarda password y el email es opcional (Mastodon no lo expone); la identidad única es `(mastodonInstance, mastodonId)`.
- **Sesión**: JWT propio firmado con `JWT_SECRET`, enviado en el header `Authorization: Bearer`. El `state` de OAuth también va firmado (anti-CSRF, expira en 10 minutos).

---

## 🛠️ Stack tecnológico

| Capa | Tecnología |
|---|---|
| API | Node.js 18+, Express 4 |
| Identidad | OAuth 2.0 de Mastodon + JWT (`jsonwebtoken`) |
| Base de datos | PostgreSQL gestionado en **Supabase** (dev/pruebas); Prisma ORM 6 |
| Web | React 18, **MUI v5** (Material Design, claro/oscuro), React Router 6, Axios |
| Móvil | Expo / React Native |
| Docs API | Swagger UI en `/api-docs` |
| Tiempo real | Socket.IO *(pendiente de implementar en backend)* |

Notas:
- En producción la base de datos puede apuntar a cualquier PostgreSQL: solo cambian `DATABASE_URL` y `DIRECT_URL`.
- MUI está **fijado en v5**: la v9 es incompatible con Create React App (react-scripts 5). No actualizar de major sin migrar el bundler.

---

## 🚀 Arranque local

Requisitos: Node.js 18+, una cuenta en [Supabase](https://supabase.com) (plan gratuito) y una cuenta Mastodon para probar el login.

### 1. Base de datos (Supabase)

Crea un proyecto y copia las cadenas de conexión desde **Connect → ORMs → Prisma**:
- *Transaction pooler* (puerto **6543**) → `DATABASE_URL` (agregar `?pgbouncer=true&connection_limit=1`)
- *Session pooler* (puerto **5432**) → `DIRECT_URL` (la usan las migraciones)

### 2. Backend

```bash
cd backend
cp .env.example .env    # completar DATABASE_URL, DIRECT_URL y JWT_SECRET
npm install
npx prisma migrate dev  # crea las tablas en Supabase
npm run dev             # http://localhost:4000
```

Comprueba `http://localhost:4000/health` → debe responder `{"status":"ok","db":"ok"}`.

### 3. Frontend

```bash
cd frontend
npm install
npm start               # http://localhost:3000
```

En `/login` escribe tu instancia de Mastodon (ej. `mastodon.social`), autoriza la app y caerás en el feed con tu sesión activa (sobrevive al refresh).

### Variables de entorno (backend/.env)

| Variable | Descripción |
|---|---|
| `DATABASE_URL` | Postgres vía pooler en modo transacción (runtime) |
| `DIRECT_URL` | Postgres conexión directa/sesión (migraciones de Prisma) |
| `JWT_SECRET` | Secreto para firmar los JWT de sesión y el `state` de OAuth. Usar un valor largo y aleatorio |
| `BACKEND_URL` | URL pública del backend; forma el `redirect_uri` de OAuth (`{BACKEND_URL}/api/auth/mastodon/callback`) |
| `FRONTEND_URL` | URL del frontend; destino de los redirects post-login |
| `PORT` | Puerto del backend (default 4000) |

> ⚠️ `.env` está en `.gitignore` y nunca debe commitearse. Si el `redirect_uri` cambia (p. ej. al desplegar), borra las filas de `MastodonApp` para que las apps se re-registren con la nueva URL.

---

## 📡 API

Documentación interactiva completa en **`http://localhost:4000/api-docs`** (Swagger). Resumen:

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| GET | `/health` | — | Estado del proceso y de la BD |
| GET | `/api/auth/mastodon/start?instance=` | — | Inicia el flujo OAuth (redirige a la instancia) |
| GET | `/api/auth/mastodon/callback` | — | Callback OAuth (uso interno del flujo) |
| GET | `/api/auth/me` | 🔒 | Usuario de la sesión actual |
| GET | `/api/posts?page=` | — | Feed paginado (20 por página) |
| POST | `/api/posts` | 🔒 | Crear posteo (`content`, `image?`, `hashtags?[]`) |
| GET | `/api/posts/search?q=` | — | Búsqueda por contenido o autor |
| POST | `/api/posts/:id/reaction` | 🔒 | Reaccionar (`type`: LIKE/ROLA/INTERESA/MOLESTA; misma = quitar, distinta = reemplazar) |
| DELETE | `/api/posts/:id/reaction` | 🔒 | Quitar la reacción propia |
| POST | `/api/posts/:id/like` | 🔒 | Alias de compatibilidad → reacción LIKE |
| POST | `/api/posts/:id/comment` | 🔒 | Comentar un posteo |
| GET | `/api/posts/:id/comments` | — | Comentarios con conteos de reacciones |
| POST/DELETE | `/api/comments/:id/reaction` | 🔒 | Reaccionar / quitar reacción en un comentario |
| GET | `/api/profile/me` | 🔒 | Perfil propio |
| PUT | `/api/profile/me` | 🔒 | Actualizar perfil propio |
| GET | `/api/profile/:id` | — | Perfil público por id |

🔒 = requiere header `Authorization: Bearer <jwt>`. Las rutas de foro, chat, mercado y admin existen como stubs y responden mensajes fijos hasta su implementación.

---

## 🗺️ Roadmap

**Fase 1 — Robustecer la red social** *(actual)*
1. ~~Reacciones cannábicas y comentarios en posteos~~ ✅ (HU-RC-001)
2. Foros reales: categorías y publicaciones por categoría.
3. Chat 1 a 1 en tiempo real (Socket.IO en el backend).
4. Endurecimiento: helmet, rate limiting en auth, CORS restringido, límites de payload, PII fuera de los perfiles públicos, rotación de secretos.
5. Herramientas de moderación básicas (reportes, bloqueo).

**Fase 2 — Mercado comunitario**
- Catálogo de tangibles e intangibles lícitos (merch, arte, glass, talleres, cursos, servicios), perfiles de vendedor, búsqueda por categoría. El modelo `MarketItem` existente evolucionará hacia este diseño.

**Fase 3 — Alcance**
- App móvil (Expo) conectada al flujo real, panel de moderación/administración, almacenamiento de imágenes (Cloudinary/S3), Docker y CI con tests.

---

## 🤝 Contribuciones

¡Las contribuciones son bienvenidas! Abre un issue o pull request para sugerencias o mejoras. Este proyecto se construye con y para la comunidad — el respeto es innegociable.
