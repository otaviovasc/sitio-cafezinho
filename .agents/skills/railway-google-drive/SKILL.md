---
name: railway-google-drive
description: Use em mudanças de deploy, Docker, Railway, PostgreSQL de produção, OAuth do Google Drive, uploads e persistência de arquivos.
---

# Infraestrutura e arquivos

- Local usa Docker e storage local; produção usa PostgreSQL central e Google Drive.
- Não dependa do filesystem efêmero em produção; use `PORT` e `DATABASE_URL`.
- Nunca exponha tokens ao cliente; criptografe refresh tokens e use escopo `drive.file`.
- Execute migrations antes do start e mantenha seed idempotente.
- Valide upload, download e persistência após redeploy.
