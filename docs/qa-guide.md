# Guia de QA familiar

Este roteiro foi feito para duas pessoas testarem todos os fluxos importantes antes de cadastrar dados reais. Usem computador e celular. Anotem para cada problema: página, ação, resultado esperado, resultado visto e uma foto da tela.

## 1. Preparar uma base limpa

Esta limpeza apaga somente o banco e os arquivos locais de desenvolvimento:

```bash
docker compose down -v
docker compose up --build -d
docker compose ps
```

Espere `app` e `db` aparecerem como `healthy` e abra `http://localhost:3000`. A senha é o valor de `APP_PASSWORD` no arquivo `.env`.

Com `SEED_DEMO_DATA=true`, a base limpa deve mostrar:

- 56 animais: 49 em lactação, 4 secas e 3 novilhas;
- Lote 1 com rotina de manhã e tarde e Lote 2 somente de manhã;
- controle de 06/05/2026 com 45 confirmados, 724,5 L e uma linha 512 aguardando revisão;
- totais diários dos últimos três meses com manhã e tarde;
- pesagens parciais, compras e fornecedores demonstrativos;
- histórico reprodutivo em Caruja, Banana, Estrela e Lua.

## 2. Entrada e navegação

- [ ] Abrir uma rota interna sem sessão e confirmar redirecionamento para `/entrar`.
- [ ] Tentar senha errada e conferir mensagem genérica.
- [ ] Entrar com a senha correta.
- [ ] No celular, abrir Início, Produção, Rebanho, Peso, Compras e Documentos pela barra inferior.
- [ ] Confirmar que nenhuma página cria rolagem horizontal.
- [ ] Sair e confirmar retorno para `/entrar`.

## 3. Início

- [ ] Conferir ações rápidas: Total do dia, Controle individual, Nova pesagem, Nova compra e Cadastrar rebanho.
- [ ] Conferir pendências reais: produção/peso em revisão, contas vencidas e vacas em lactação sem lote.
- [ ] Conferir gráficos de produção e compras sem pontos inventados nos dias ausentes.
- [ ] Conferir os números de lactação, secas, novilhas e lotes.
- [ ] Ler o Guia rápido e verificar se a rotina está clara para os dois testadores.

## 4. Rebanho e busca

- [ ] Buscar Caruja por nome e um animal numérico pelo brinco.
- [ ] Abrir “Mais filtros” no celular e combinar situação, lote e atenção.
- [ ] Confirmar que a lista possui rolagem própria e não cresce indefinidamente.
- [ ] Clicar em qualquer área de uma linha/cartão e confirmar abertura do animal.
- [ ] Cadastrar um animal individual com nome, brinco, situação e lote quando aplicável.
- [ ] Cadastrar vários animais colando uma linha por animal; testar `Nome; brinco`.
- [ ] Tentar repetir um brinco e conferir o bloqueio visível.

## 5. Ciclo produtivo, reprodução e lote

Use um animal criado apenas para o teste.

- [ ] Cadastrar como Novilha e confirmar que não possui lote nem entra na ordenha.
- [ ] Registrar parto, escolher Lote 1 e confirmar mudança para Em lactação.
- [ ] Confirmar o parto e o início da lactação na linha do tempo.
- [ ] Registrar cio sem cobertura.
- [ ] Registrar outro cio com cobertura, touro opcional e resultado aguardando confirmação.
- [ ] Editar essa cobertura para Prenhez confirmada, com data da confirmação.
- [ ] Confirmar que a prenhez não muda a situação Em lactação.
- [ ] Excluir um cio após a confirmação destrutiva.
- [ ] Iniciar período seco e confirmar encerramento do lote.
- [ ] Desfazer a última situação e confirmar restauração segura do lote e do status.
- [ ] Iniciar período seco novamente; depois registrar novo parto e Lote 2.
- [ ] Mudar de Lote 2 para Lote 1 e conferir todo o histórico de lotes.
- [ ] Editar nome, brinco e observação sem alterar os históricos.
- [ ] Adicionar e remover um alias.
- [ ] Conferir gráficos de produção e peso do animal por período.

Regras que devem permanecer verdadeiras:

- Novilha é antes da primeira lactação; Seca é entre lactações.
- Somente Em lactação pertence a lote e recebe controle individual.
- Prenhez e situação produtiva são informações paralelas.
- Venda e morte exigem motivo e encerram o ciclo; testem somente em um animal descartável.

## 6. Produção total diária

- [ ] Em Produção, registrar data, litros da manhã e litros da tarde usando vírgula.
- [ ] Conferir o total calculado antes de salvar e no histórico.
- [ ] Editar os dois períodos e conferir a nova soma.
- [ ] Tentar registrar outro total na mesma data e conferir o bloqueio.
- [ ] Tentar registrar total numa data que já tenha controle individual e conferir o bloqueio.
- [ ] Excluir o registro após confirmação.
- [ ] Conferir que registros antigos sem divisão, se existirem, são identificados como históricos e não recebem uma divisão inventada.

## 7. Controle individual com ChatGPT

- [ ] Abrir Importar controle individual e copiar o prompt.
- [ ] Carregar o exemplo, validar e conferir a prévia antes de salvar.
- [ ] Testar JSON envolvido em bloco Markdown e confirmar remoção automática.
- [ ] Testar JSON inválido, número negativo e manhã+tarde divergente do total.
- [ ] Buscar, filtrar inconsistências, ajustar vínculo, confiança, manhã e tarde numa linha.
- [ ] Cadastrar um animal novo durante a revisão e vinculá-lo.
- [ ] Confirmar que o sistema exige todas as vacas que estavam em lactação e em lote na data.
- [ ] Confirmar que Lote 2 exige manhã, mas não inventa tarde.
- [ ] Salvar e abrir o detalhe do controle.
- [ ] Na sessão de 06/05/2026, confirmar 724,5 L; confirmar a linha 512 e conferir 737,5 L.
- [ ] Confirmar que excluídos e pendentes não entram no total.
- [ ] Editar uma medição, associar o animal correto, alterar status e verificar os filtros.
- [ ] Excluir uma sessão criada para teste após a confirmação.

## 8. Peso

- [ ] Copiar o prompt de pesagem e carregar o exemplo.
- [ ] Validar uma lista parcial: não deve exigir todo o rebanho.
- [ ] Corrigir um peso duvidoso, vínculo e confiança antes de salvar.
- [ ] Salvar, abrir a sessão e confirmar que somente pesos confirmados entram no resumo.
- [ ] Abrir o animal pesado e conferir a evolução no gráfico.
- [ ] Excluir uma sessão criada para teste.

## 9. Compras, fornecedores e documentos

- [ ] Criar compra rápida em menos de um minuto.
- [ ] Criar fornecedor dentro do fluxo e depois encontrá-lo em Fornecedores.
- [ ] Abrir Mais detalhes; adicionar, editar e remover itens.
- [ ] Criar divergência entre itens e total e conferir alerta sem bloqueio absoluto.
- [ ] Informar vencimento passado e confirmar estado Vencida derivado.
- [ ] Marcar paga, reabrir e cancelar uma compra de teste.
- [ ] Anexar JPEG/PNG/WebP e PDF; no celular testar captura pela câmera.
- [ ] Anexar nota, boleto e comprovante à mesma compra e confirmar que continua uma única despesa.
- [ ] Abrir/baixar, alterar tipo/observação, desvincular e excluir documento.
- [ ] Enviar o mesmo arquivo novamente e conferir aviso de duplicidade.
- [ ] Conferir o documento também na página Documentos.

## 10. Persistência local

- [ ] Criar um animal e enviar um PDF pequeno.
- [ ] Executar `docker compose restart`.
- [ ] Confirmar que animal, banco e documento continuam acessíveis.
- [ ] Executar `docker compose exec app node dist/db/seed.js` duas vezes e confirmar que o seed não duplica dados.

## 11. Google Drive e Railway — somente quando configurados

Não há tela de conexão. O Drive é autorizado uma vez pelo responsável conforme `docs/google-drive-setup.md`.

- [ ] Executar `pnpm google-drive:authorize`, autorizar a conta escolhida e guardar o refresh token como segredo.
- [ ] Configurar Railway conforme `docs/railway-deployment.md` sem `SEED_DEMO_DATA=true`.
- [ ] Fazer upload e confirmar o arquivo dentro da pasta configurada no Drive.
- [ ] Abrir/baixar e excluir pelo sistema; confirmar o efeito no Drive.
- [ ] Fazer redeploy e confirmar que banco e arquivo continuam acessíveis.
- [ ] Revogar o token apenas em ambiente de teste e confirmar erro claro de armazenamento.

## 12. Como relatar um problema

Use este formato:

```text
Dispositivo/navegador:
Página:
Dados usados:
Passos:
Resultado esperado:
Resultado obtido:
Foto ou vídeo:
```

Não use dados verdadeiros até os dois testadores concluírem este roteiro e os problemas graves estarem corrigidos.
