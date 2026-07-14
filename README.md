# WeedTown 🌍🌿

**WeedTown** es una red social diseñada para nómadas digitales que buscan compartir experiencias, conectar con otros viajeros y acceder a espacios de arrendamiento de inmuebles en diferentes partes del mundo.

---

## 🚀 Descripción del Proyecto

WeedTown combina funcionalidades sociales como foros, publicaciones con imágenes y chat en tiempo real, con un espacio de comercio para arrendar propiedades. Está pensada para ser accesible desde web, apps móviles y contar con un panel administrativo para moderación y gestión.

---

## 🧩 Funcionalidades Principales

- ✅ Identidad federada con **Mastodon** (OAuth 2.0, cualquier instancia del fediverso)
- 📰 Feed de posteos con texto, imágenes y hashtags
- 🗣️ Foros tipo blog con categorías temáticas *(pendiente)*
- 💬 Chat 1 a 1 en tiempo real *(pendiente)*
- 🏠 Espacio de comercio para arrendamiento de inmuebles *(pendiente)*
- 🛠️ Panel administrativo para gestión de usuarios y contenido *(pendiente)*

---

## 🛠️ Stack Tecnológico

### Frontend
- **React** para la versión web
- **React Native** para apps móviles (iOS y Android)

### Backend
- **Node.js** con **Express**
- **Autenticación federada** vía OAuth 2.0 de Mastodon (registro dinámico de app por instancia) + JWT propio para la sesión
- **Socket.IO** para chat en tiempo real *(pendiente)*

### Base de Datos
- **PostgreSQL** gestionado en **Supabase** (dev/pruebas; producción puede apuntar a cualquier Postgres)
- **Prisma ORM** para modelado y consultas

---

## 🚀 Arranque local

1. **Supabase**: crea un proyecto y copia las cadenas de conexión (pooler puerto 6543 y directa puerto 5432).
2. **Backend**:
   ```bash
   cd backend
   cp .env.example .env   # completar DATABASE_URL, DIRECT_URL y JWT_SECRET
   npm install
   npx prisma migrate dev # crea las tablas en Supabase
   npm run dev            # http://localhost:4000 (health check en /health)
   ```
3. **Frontend**:
   ```bash
   cd frontend
   npm install
   npm start              # http://localhost:3000
   ```
4. En `/login` escribe tu instancia de Mastodon (p. ej. `mastodon.social`) y autoriza la app.

### Otros Servicios
- **Cloudinary** o **Amazon S3** para almacenamiento de imágenes
- **Swagger** para documentación de la API
- **Docker** (opcional) para contenerización

---

## 📁 Estructura del Proyecto (sugerida)

```
/weedtown
├── backend
│   ├── src
│   │   ├── controllers
│   │   ├── routes
│   │   ├── models
│   │   ├── services
│   │   └── middlewares
│   ├── prisma
│   └── app.js
├── frontend
│   ├── public
│   └── src
│       ├── components
│       ├── pages
│       ├── hooks
│       └── services
├── mobile
│   └── (estructura similar a frontend con React Native)
├── admin-panel
│   └── (dashboard para moderación y gestión)
└── README.md
```

---

## 📌 Estado del Proyecto

🚧 En desarrollo. Se están diseñando las interfaces y definiendo los endpoints de la API.

---

## 🤝 Contribuciones

¡Las contribuciones son bienvenidas! Por favor, abre un issue o pull request para sugerencias o mejoras.
