const assert = require('assert');
const { generatePortfolioAlerts } = require('../services/notificationService');

console.log('?? Testando Centro de Notificações & Auditor de Ativos...\n');

// Teste 1: Detecção de Ativo com Risco / Fundamentos Ruins (Dívida alta e Vacância)
{
  const mockPortfolio = {
    assets: [
      {
        ticker: 'EMPR3',
        type: 'ACAO',
        currentPrice: 10.00,
        historicalAverageDPA: 0.50,
        targetAnnualYield: 0.06,
        score: 5,
        deepDive: { netDebtToEbitda: 4.2, payoutPercent: 120, sector: 'Construção' } // Alavancada e Payout insustentável
      },
      {
        ticker: 'VAGO11',
        type: 'FII_TIJOLO',
        currentPrice: 90.00,
        pvpRatio: 1.25, // Ágio alto
        deepDive: { physicalVacancyPercent: 18.5 } // Vacância crítica
      }
    ]
  };

  const alerts = generatePortfolioAlerts(mockPortfolio, []);
  const debtAlert = alerts.find(a => a.id === 'risk-debt-EMPR3');
  const payoutAlert = alerts.find(a => a.id === 'risk-payout-EMPR3');
  const vacancyAlert = alerts.find(a => a.id === 'risk-vacancy-VAGO11');
  const pvpAlert = alerts.find(a => a.id === 'risk-pvp-VAGO11');

  assert(debtAlert, 'Deve gerar alerta de dívida excessiva');
  assert(payoutAlert, 'Deve gerar alerta de payout > 100%');
  assert(vacancyAlert, 'Deve gerar alerta de vacância física elevada');
  assert(pvpAlert, 'Deve gerar alerta de ágio sobre VP');
  console.log('? Teste 1 Passou: Auditoria de Ativos Ruins / Riscos de Fundamentos');
}

// Teste 2: Detecção de Oportunidades Fortes no Pregão (Margem de Segurança >= 20%)
{
  const mockPortfolio = {
    assets: [
      {
        ticker: 'BBAS3',
        type: 'ACAO',
        currentPrice: 28.00,
        historicalAverageDPA: 2.40, // Preço Teto = 40.00 -> Margem = +42.8%
        targetAnnualYield: 0.06,
        score: 10,
        deepDive: { netDebtToEbitda: 0.0, sector: 'Financeiro' }
      }
    ]
  };

  const alerts = generatePortfolioAlerts(mockPortfolio, []);
  const oppAlert = alerts.find(a => a.category === 'OPPORTUNITY');
  assert(oppAlert, 'Deve gerar alerta de oportunidade forte');
  console.log(`? Teste 2 Passou: Detecção de Oportunidade: ${oppAlert.title}`);
}

console.log('\n?? Todos os testes do sistema de notificações passaram com 100% de sucesso!');
