# Configuração única do Google Drive

O sistema usa diretamente uma pasta criada pela família. Não existe tela de conexão, token no banco ou OAuth dentro da aplicação.

## 1. Preparar o Google Cloud

1. Crie ou selecione um projeto no Google Cloud.
2. Ative a Google Drive API.
3. Configure a tela de consentimento OAuth.
4. Crie um cliente OAuth do tipo **Aplicativo da Web**.
5. Adicione a URI autorizada `http://127.0.0.1:53682/oauth2/callback`.
6. Durante os testes, adicione a conta escolhida como test user.
7. Quando estiver validado, publique o app OAuth como **In production** para evitar a expiração curta típica do modo Testing.

O escopo usado é `drive.file`, além de `openid` e `email` durante a autorização. A aplicação só gerencia arquivos criados por ela dentro da pasta informada.

## 2. Criar a pasta

Crie manualmente uma pasta, por exemplo `Gestão do Sítio`, na conta que ficará responsável pelos arquivos. Copie o ID exibido na URL após `/folders/`.

## 3. Gerar o refresh token

Preencha `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET` no `.env` local e execute:

```bash
pnpm google-drive:authorize
```

Abra a URL mostrada, autorize a conta e volte ao terminal. O script valida o `state`, recebe o código apenas em `127.0.0.1` e mostra o refresh token uma vez.

## 4. Configurar no Railway

No serviço da aplicação, defina:

```text
STORAGE_MODE=google_drive
GOOGLE_CLIENT_ID=<client id>
GOOGLE_CLIENT_SECRET=<client secret>
GOOGLE_REFRESH_TOKEN=<refresh token gerado>
GOOGLE_DRIVE_FOLDER_ID=<id da pasta>
```

Nunca coloque esses valores no repositório, em screenshots ou logs. Se o token for revogado, execute novamente o script e substitua somente `GOOGLE_REFRESH_TOKEN`.

## Checklist manual com Drive real

- [ ] Enviar JPEG pela tela Documentos
- [ ] Confirmar o arquivo na pasta do Drive
- [ ] Abrir/baixar pelo sistema
- [ ] Enviar PDF no detalhe de uma compra
- [ ] Excluir e confirmar remoção no Drive
- [ ] Fazer redeploy e confirmar que o arquivo continua acessível
