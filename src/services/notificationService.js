/**
 * Centro de Notificações Previdenciárias & Auditor de Saúde de Ativos
 * Mapeia ativos bons, em risco (fundamentos ruins) e alertas de Data COM/Proventos.
 */

function generatePortfolioAlerts(portfolio, shareClassesData = []) {
  if (!portfolio || !portfolio.assets) return [];

  const alerts = [];
  const now = new Date();

  // 1. AUDITORIA DE ATIVOS RUINS / RISCO DE FUNDAMENTOS
  portfolio.assets.forEach(asset => {
    const deep = asset.deepDive || {};

    // Ações: Alavancagem Excessiva (Dívida Líquida / EBITDA > 3.5x)
    if (asset.type === 'ACAO' && deep.netDebtToEbitda > 3.5 && deep.sector !== 'Financeiro') {
      alerts.push({
        id: `risk-debt-${asset.ticker}`,
        category: 'RISK',
        severity: 'HIGH',
        ticker: asset.ticker,
        title: `Alavancagem Excessiva em ${asset.ticker}`,
        message: `A relação Dívida Líquida / EBITDA atingiu ${deep.netDebtToEbitda}x (limite de segurança: 3.0x). Risco elevado de compressão de margens e corte nos dividendos futuros.`,
        actionAdvice: 'Pausar novos aportes e acompanhar a próxima divulgação de resultados.',
        createdAt: now.toISOString()
      });
    }

    // Ações: Payout Insustentável (> 100%)
    if (asset.type === 'ACAO' && deep.payoutPercent > 100) {
      alerts.push({
        id: `risk-payout-${asset.ticker}`,
        category: 'RISK',
        severity: 'MEDIUM',
        ticker: asset.ticker,
        title: `Payout Insustentável em ${asset.ticker}`,
        message: `A empresa está distribuindo ${deep.payoutPercent}% do lucro líquido. Payout acima de 100% significa consumo de reservas de caixa ou endividamento para pagar proventos.`,
        actionAdvice: 'Avaliar se o dividendo não é não-recorrente.',
        createdAt: now.toISOString()
      });
    }

    // FIIs de Tijolo: Vacância Crítica (> 12%)
    if (asset.type === 'FII_TIJOLO' && deep.physicalVacancyPercent > 12) {
      alerts.push({
        id: `risk-vacancy-${asset.ticker}`,
        category: 'RISK',
        severity: 'HIGH',
        ticker: asset.ticker,
        title: `Vacância Física Elevada em ${asset.ticker}`,
        message: `O fundo está com ${deep.physicalVacancyPercent}% de área vaga (desocupada). Isso reduz a receita de aluguéis e aumenta custos de condomínio/IPTU arcados pelo fundo.`,
        actionAdvice: 'Verificar se há novas locações em negociação ou risco de reajuste negativo.',
        createdAt: now.toISOString()
      });
    }

    // FIIs: Preço / Valor Patrimonial muito esticado (P/VP > 1.15)
    if ((asset.type === 'FII_TIJOLO' || asset.type === 'FII_PAPEL') && asset.pvpRatio > 1.15) {
      alerts.push({
        id: `risk-pvp-${asset.ticker}`,
        category: 'RISK',
        severity: 'MEDIUM',
        ticker: asset.ticker,
        title: `Ágio Excessivo no FII ${asset.ticker} (P/VP ${asset.pvpRatio})`,
        message: `O fundo está negociando ${((asset.pvpRatio - 1) * 100).toFixed(0)}% acima do valor patrimonial dos seus ativos. Risco de perda de capital caso haja novas emissões de cotas.`,
        actionAdvice: 'Evitar compras com Ágio superior a 5-10% sobre o VP.',
        createdAt: now.toISOString()
      });
    }
  });

  // 2. AUDITORIA DE ATIVOS BONS / OPORTUNIDADES FORTES NO PREGÃO
  portfolio.assets.forEach(asset => {
    const bazin = asset.historicalAverageDPA && asset.targetAnnualYield 
      ? (asset.historicalAverageDPA / asset.targetAnnualYield) 
      : 0;

    if (bazin > 0 && asset.currentPrice > 0) {
      const margin = ((bazin - asset.currentPrice) / asset.currentPrice) * 100;

      // Oportunidade: Margem de Segurança >= 20% com Fundamentos Sólidos
      if (margin >= 20 && (asset.score || 0) >= 8) {
        alerts.push({
          id: `opp-bazin-${asset.ticker}`,
          category: 'OPPORTUNITY',
          severity: 'POSITIVE',
          ticker: asset.ticker,
          title: `Super Oportunidade no Pregão: ${asset.ticker}`,
          message: `O ativo está com excelente margem de segurança de +${margin.toFixed(1)}% (Cotação R$ ${asset.currentPrice.toFixed(2)} vs Preço Teto R$ ${bazin.toFixed(2)}) e nota de fundamentos ${asset.score}/10.`,
          actionAdvice: 'Ativo prioritário para o próximo aporte previdenciário.',
          createdAt: now.toISOString()
        });
      }
    }
  });

// 3. OPORTUNIDADES DE ARBITRAGEM DE CLASSES (3 vs 4 vs 11)
  if (shareClassesData && shareClassesData.length > 0) {
    shareClassesData.forEach(item => {
      if (item.unitPrice > 0 && item.onPrice > 0 && item.pnPrice > 0) {
        const theo = (item.onPrice * (item.unitComposition.onQty || 1)) + (item.pnPrice * (item.unitComposition.pnQty || 1));
        const disc = ((theo - item.unitPrice) / theo) * 100;

        if (disc >= 3.0) {
          alerts.push({
            id: `opp-class-${item.tickerBase}`,
            category: 'OPPORTUNITY',
            severity: 'POSITIVE',
            ticker: `${item.tickerBase}11`,
            title: `Desconto de Arbitragem em ${item.tickerBase}11`,
            message: `A UNIT ${item.tickerBase}11 está com ${disc.toFixed(1)}% de desconto em relação à compra das ações ${item.tickerBase}3 e ${item.tickerBase}4 separadas (Valor teórico: R$ ${theo.toFixed(2)} vs Tela: R$ ${item.unitPrice.toFixed(2)}).`,
            actionAdvice: `Comprar ${item.tickerBase}11 é mais vantajoso que comprar ${item.tickerBase}3 ou ${item.tickerBase}4 separadas hoje.`,
            createdAt: now.toISOString()
          });
        }
      }
    });
  }

  return alerts;
}

if (typeof module !== 'undefined') {
  module.exports = {
    generatePortfolioAlerts
  };
}
