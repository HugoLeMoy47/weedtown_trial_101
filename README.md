# WeedTown 🌍🌿

**WeedTown** es una red social diseñada para nómadas digitales que buscan compartir experiencias, conectar con otros viajeros y acceder a espacios de arrendamiento de inmuebles en diferentes partes del mundo.

---

## 🚀 Descripción del Proyecto

WeedTown combina funcionalidades sociales como foros, publicaciones con imágenes y chat en tiempo real, con un espacio de comercio para arrendar propiedades. Está pensada para ser accesible desde web, apps móviles y contar con un panel administrativo para moderación y gestión.

---

## 🧩 Funcionalidades Principales

- ✅ Registro/Login con email y redes sociales
- 📰 Feed de posteos con texto e imágenes
- 🗣️ Foros tipo blog con categorías temáticas
- 💬 Chat 1 a 1 en tiempo real
- 🏠 Espacio de comercio para arrendamiento de inmuebles
- 🛠️ Panel administrativo para gestión de usuarios y contenido

---

## 🛠️ Stack Tecnológico

### Frontend
- **React** para la versión web
- **React Native** para apps móviles (iOS y Android)
- **TailwindCSS** o **Styled Components** para estilos

### Backend
- **Node.js** con **Express**
- **Autenticación** con JWT y OAuth (Google, Facebook)
- **Socket.IO** para chat en tiempo real

### Base de Datos
- **PostgreSQL**
- **Prisma ORM** para modelado y consultas

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
