/**
 * Ponto de extensão para capturas Playwright do projeto.
 * Adicionar após a configuração de Playwright e rotas reais existirem.
 */
export const visualViewports = [
  { name: "mobile", width: 390, height: 844 },
  { name: "mobile-small", width: 360, height: 800 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1440, height: 900 },
] as const;
