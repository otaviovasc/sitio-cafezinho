# Checklist de implementação

Decisão de escopo: seguir a correção 80/20 — local em volume Docker e Railway em uma pasta Google Drive já criada, usando refresh token em variável de ambiente. Não haverá tela de conexão, tabela de conexão, OAuth dentro do app, token no banco, múltiplos providers simultâneos ou fake de Drive.

## Marco 1 — Base

- [x] Inspecionar repositório e regras
- [x] Registrar limites e comandos
- [x] Instalar dependências e validar bootstrap

## Marco 2 — Domínio e API

- [x] Schema, migrations e seed idempotente
- [x] Rebanho, aliases e pesagens com data/hora
- [x] Total diário do rebanho, separado dos controles individuais
- [x] Sessões e medições de leite
- [x] Parser/importação de transcrição
- [x] Compras, itens e vencimentos
- [x] Documentos e armazenamento
- [x] Painel e autenticação compartilhada

## Marco 3 — Frontend

- [x] Shell e primitives mobile-first
- [x] Entrada e painel
- [x] Rebanho e histórico de peso
- [x] Total diário, importação do controle individual, detalhe e correção
- [x] Compras, fornecedores e documentos
- [x] Estados de erro, vazio, sucesso e confirmação

## Marco 4 — Operação

- [x] Dockerfile e Compose
- [x] Google Drive por ambiente + script de autorização
- [x] Railway e documentação operacional

## Marco 5 — Evidências

- [x] Lint e typecheck
- [x] Unitários e integração
- [x] Docker limpo, healthcheck, seed e persistência
- [x] Playwright desktop/mobile/tablet
- [x] Screenshots 390x844, 360x800, 768x1024 e 1440x900
- [x] Revisão visual e correções
- [x] Revisão final de diff, TODOs e superfícies

## Ações externas (não executadas nesta fase)

- [ ] Criar projeto, aplicação e PostgreSQL no Railway
- [ ] Criar pasta e cliente OAuth no Google Cloud/Drive
- [ ] Gerar refresh token real e executar checklist manual do Drive
- [ ] Fazer deploy e smoke test no domínio público

## Evolução de operação — julho de 2026

- [x] Separar ciclo produtivo (status) de lote operacional (grupo)
- [x] Registrar histórico datado de mudanças de status, com motivo
- [x] Encerrar lote ao sair de lactação e exigir lote ao entrar em lactação
- [x] Remover ações rápidas da lista e abrir o detalhe pelo clique na linha inteira
- [x] Reorganizar o detalhe do animal com resumo e históricos úteis
- [x] Adicionar cadastro em massa do rebanho com prévia
- [x] Criar aba Peso com sessões, importação de transcrição e revisão parcial
- [x] Melhorar revisão de controle individual com filtros de inconsistência
- [x] Remover o cadastro manual de produção da navegação principal
- [x] Enriquecer Início com pendências, tendências e atalhos operacionais
- [x] Adicionar três meses de dados demonstrativos plausíveis e idempotentes
- [x] Atualizar mapa de superfícies, regras e arquitetura
- [x] Validar unitários, integração, Docker, Playwright e screenshots responsivos

## Evolução de uso real — lotes e análise

- [x] Criar Lote 1 e Lote 2 como dados iniciais com rotina configurável
- [x] Registrar histórico datado de mudança de grupo por animal
- [x] Iniciar todos os animais do seed no Lote 1 e registrar mudanças posteriores
- [x] Permitir total diário e controle individual na mesma data como fatos independentes
- [x] Exigir controle completo das vacas em lactação dos grupos com ordenha
- [x] Cadastrar animal durante o controle individual
- [x] Adicionar filtros, buscas e listas roláveis consistentes
- [x] Aplicar iconografia sem emoji em toda a navegação
- [x] Exibir evolução geral e individual por período
- [x] Adicionar tutorial curto na página inicial
- [x] Validar migrations, Docker, Playwright e screenshots novamente

## Evolução de ciclo produtivo e reprodução

- [x] Simplificar situações para Novilha, Em lactação, Seca, Vendida e Morta
- [x] Registrar cio, cobertura, resultado e parto sem misturar com lote
- [x] Permitir corrigir eventos reprodutivos e desfazer a última mudança de ciclo
- [x] Separar o total diário entre manhã e tarde preservando totais históricos
- [x] Remover ações rápidas e abrir o animal pelo clique na linha inteira
- [x] Reorganizar o detalhe do animal com linha do tempo e indicadores factuais
- [x] Atualizar seed e testes com ciclos reprodutivos plausíveis
- [x] Criar guia manual de QA para a família
- [x] Revalidar Docker, testes reais e screenshots responsivos

## Evolução para operação diária

- [x] Permitir produção total diária do rebanho todo ou por lote, preservando históricos e evitando dupla contagem
- [x] Remover a exclusividade entre produção agregada e controle individual
- [x] Adicionar coleta independente, comparação factual e documentos
- [x] Adicionar casos e ações de mastite, carência informada e histórico no animal
- [x] Adicionar receitas, caixa registrado e saída econômica sem duplicar receita
- [x] Transformar a rota principal em Hoje com pendências reais e ações prioritárias
- [x] Adicionar exportações CSV e scripts de backup/restauração PostgreSQL 17
- [x] Ensaiar backup e restauração em banco local descartável
- [ ] Validar Railway e Google Drive em produção — adiado por decisão do responsável
