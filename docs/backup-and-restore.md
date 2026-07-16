# Backup e restauração

O PostgreSQL é a fonte oficial dos dados. Documentos continuam no provider configurado (volume local ou Google Drive) e devem ser protegidos separadamente.

## Criar backup

Com `DATABASE_URL` apontando para o banco correto e `pg_dump`/`pg_restore` 17 ou compatível instalados:

```bash
pnpm backup:create
```

O arquivo custom é criado em `backups/`, recebe data e hora no nome e é validado com `pg_restore --list`. Para escolher outro caminho:

```bash
pnpm backup:create --file=/caminho/seguro/sitio.dump
```

O script não sobrescreve um arquivo existente sem `--force` e nunca imprime a senha do banco.

## Restaurar

Confira duas vezes o `DATABASE_URL`. A restauração limpa os objetos existentes no banco alvo antes de recriá-los:

```bash
pnpm backup:restore --file=/caminho/seguro/sitio.dump
```

Em terminal interativo, digite `RESTAURAR` quando solicitado. Em um ensaio automatizado e descartável, use `--confirm` somente após apontar `DATABASE_URL` para o banco temporário.

O arquivo é validado antes de qualquer alteração. Um arquivo inválido, ausente ou um utilitário PostgreSQL indisponível encerra o comando com mensagem clara.

## Ambiente local

O container da aplicação inclui os clientes PostgreSQL. Para criar o backup pelo container, monte ou copie depois o arquivo para fora do filesystem do container. Para desenvolvimento no host, publique o PostgreSQL ou use uma `DATABASE_URL` alcançável pelo host.

Nunca trate `docker compose down -v` como backup: esse comando apaga o volume local.

## Railway

Antes de migration ou primeira carga real:

1. confirme `SEED_DEMO_DATA=false`;
2. gere um backup pelo recurso PostgreSQL/Railway ou execute `pnpm backup:create` em ambiente seguro com a `DATABASE_URL` privada;
3. armazene o `.dump` fora do filesystem efêmero do serviço;
4. mantenha também a pasta Google Drive protegida;
5. ensaie a restauração em outro banco PostgreSQL antes de depender do arquivo.

Não restaure sobre produção para testar. Crie um banco temporário, execute a restauração com `--confirm`, confira migrations e contagens e então descarte esse banco.
