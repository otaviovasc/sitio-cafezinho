# Projeto

Sistema simples de gestão de uma propriedade leiteira familiar.

## Skills obrigatórias

- Domínio ou dados: `$sitio-domain`.
- Frontend: `$field-mobile-ux` e `$sitio-ui-system`.
- Alteração visual: `$visual-qa`.
- Docker, Railway, Google Drive ou uploads: `$railway-google-drive`.
- Antes de concluir: `$release-finalization`.

## Regras centrais

- Simplicidade acima de completude especulativa.
- Não inventar dados nem transformar estimativas em medições reais.
- Não criar botão, filtro, endpoint ou campo sem uso real.
- Não declarar conclusão sem validação.

## Limites do MVP

- Manter senha compartilhada; não criar usuários, papéis ou multi-tenancy.
- Preservar `rawAnimalLabel` e `rawValueText`; nunca inventar manhã, tarde ou dias ausentes.
- Não ratear o total diário do rebanho entre animais; controles individuais continuam pontuais.
- Permitir que a produção total diária seja do rebanho todo ou de um lote específico. Registros antigos sem lote continuam representando o rebanho todo; resumos preferem o total geral e só somam lotes quando ele estiver ausente.
- Permitir total diário e controle individual na mesma data; são fatos independentes e nenhum substitui o outro.
- Tratar coleta do laticínio como terceiro fato independente; ela não é produção e diferenças não recebem causa automática.
- Mastite registra observação, decisão humana, ação e carência informada; nunca diagnosticar, prescrever ou liberar leite automaticamente.
- Receita recebida e compra paga formam somente o resultado de caixa registrado, não lucro completo.
- Venda cria no máximo uma receita; morte nunca usa o fluxo comercial.
- Grupos são configuráveis e editados no contexto do animal; não codificar regras por nome do lote.
- Preservar o histórico datado de mudança de grupo e aplicar a rotina válida na data do controle.
- Tratar situação como ciclo produtivo e lote como rotina de ordenha; sair de lactação encerra o lote atual.
- Tratar reprodução em paralelo: cio/cobertura não muda situação; parto inicia lactação; prenhez nunca é inferida.
- Nunca habilitar `SEED_DEMO_DATA` em produção.
- Documentos reutilizam `attachments`; documentos de compra, coleta, receita ou saída nunca criam outro fato financeiro.
- Toda funcionalidade útil deve ter uma superfície no frontend; não criar endpoint morto.
- Local usa volume Docker; Railway usa Google Drive por variáveis de ambiente.
- Não armazenar tokens Google no banco nem expô-los ao cliente.
- Executar migrations e seed idempotente antes do start.
- Não versionar `.env`, uploads, credenciais, tokens ou documentos reais.
