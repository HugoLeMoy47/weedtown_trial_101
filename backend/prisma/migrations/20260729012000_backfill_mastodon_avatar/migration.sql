-- Relleno único: las cuentas creadas antes de los avatares generados tienen la
-- foto de Mastodon en "avatar" y "mastodonAvatar" vacío. Se copia para que la
-- opción "usar mi foto de Mastodon" funcione sin esperar a su próximo login.
--
-- Deliberadamente NO se les cambia el avatar: quitarle a alguien la foto que ya
-- tenía sin avisar sería una sorpresa desagradable. El cambio de default aplica
-- a las cuentas nuevas; a las existentes se les avisa desde el perfil.
UPDATE "User"
SET "mastodonAvatar" = "avatar"
WHERE "mastodonAvatar" IS NULL
  AND "avatar" IS NOT NULL
  AND "avatar" NOT LIKE '%/api/avatars/%';
