# Áudio do jogo — coloque os arquivos aqui

O jogo procura os arquivos abaixo (caminhos fixos, definidos em
`src/client/features/game/audio.ts` → `GAME_AUDIO_FILES`). Enquanto um arquivo
não existir, um placeholder sintetizado (WebAudio) toca no lugar — basta soltar
o `.mp3` nesta pasta com o nome exato e recarregar; nenhum código muda.

| Arquivo | Quando toca |
|---|---|
| `soundtrack.mp3` | Trilha ambiente em loop no tabuleiro (volume 0.32) |
| `moo.mp3` | Clique no rebanho (mugido) |
| `click.mp3` | Toque em instalações / abrir folhas |
| `milk-pour.mp3` | Produção do dia registrada (tanque enchendo) |
| `truck.mp3` | Coleta registrada (caminhão atravessa) |
| `feed.mp3` | Trato registrado (ração no cocho) |
| `plant.mp3` | Plantio registrado na Plantação |
| `harvest.mp3` | Colheita registrada |
| `success.mp3` | Confirmações genéricas |
| `buy.mp3` | Compra na Loja (caixa registradora/moedas) |

Formato: `.mp3` (ou troque a extensão também em `GAME_AUDIO_FILES`). Efeitos
curtos (< 2s); a trilha pode ser longa — ela entra em loop.
