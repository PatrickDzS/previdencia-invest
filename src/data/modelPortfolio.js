/**
 * Conteúdo Educativo da Academia do Investidor
 * (Trilhas de aprendizado e conteúdo estático da plataforma)
 */

// Trilhas da Academia do Investidor ("Onde e Como Olhar")
const INVESTOR_ACADEMY_TRACKS = [
  {
    id: "track-01",
    title: "1. O Método Previdenciário (Décio Bazin & Luiz Barsi)",
    badge: "Fundamentos",
    description: "Aprenda a investir em empresas sólidas para gerar uma renda passiva mensal perpétua.",
    lessons: [
      {
        title: "A Regra dos 6% e o Preço Teto de Bazin",
        content: "Décio Bazin formulou que você só deve comprar uma ação se o Dividendo por Ação (DPA) médio projetado garantir pelo menos 6% ao ano de retorno. Preço Teto = DPA / 0.06. Se a ação negociar abaixo desse valor, você compra com Margem de Segurança."
      },
      {
        title: "Compre para Nunca Vender (Buy & Hold Previdenciário)",
        content: "O investidor de renda passiva foca em acumular quantidade de ações e cotas, não em acertar o topo ou fundo do gráfico. O lucro vem do crescimento dos proventos pagos pelas empresas."
      },
      {
        title: "O Efeito Bola de Neve (Reinvestimento)",
        content: "No início, seus aportes representam 100% do crescimento da carteira. Com o tempo, os dividendos recebidos ultrapassam o valor que você tira do seu bolso, gerando um efeito exponencial de juros compostos."
      }
    ]
  },
  {
    id: "track-02",
    title: "2. Onde Olhar ao Analisar Ações",
    badge: "Ações",
    description: "O checklist prático para escolher empresas à prova de falência com lucros crescentes.",
    lessons: [
      {
        title: "1º Passo: O que a empresa faz? (Setor e Negócio)",
        content: "Prefira empresas de setores perenes e essenciais conhecidos como 'BEST': Bancos, Energia (Transmissão/Geração), Saneamento, Telecomunicações e Seguros. Empresas que as pessoas precisam continuar usando faça chuva ou faça sol."
      },
      {
        title: "2º Passo: Lucros Consistentes nos Últimos 5 Anos",
        content: "Nunca compre empresas que operam no prejuízo crônico na esperança de 'turnaround'. Olhe o histórico de Lucro Líquido dos últimos 5 a 10 anos."
      },
      {
        title: "3º Passo: Endividamento Seguro (Dívida Líquida / EBITDA)",
        content: "A relação Dívida Líquida / EBITDA indica em quantos anos a empresa quitaria suas dívidas com a geração de caixa operacional. O limite saudável para a maioria dos setores é abaixo de 2.5x a 3.0x."
      },
      {
        title: "4º Passo: Governança e Alinhamento",
        content: "Verifique se a empresa está listada no Novo Mercado da B3, se possui Tag Along de 100% (proteção para o pequeno acionista) e Free Float superior a 20-25%."
      }
    ]
  },
  {
    id: "track-03",
    title: "3. Onde Olhar ao Analisar FIIs de Tijolo e Papel",
    badge: "FIIs",
    description: "Como inspecionar imóveis físicos, vacância, e como auditar dívidas imobiliárias (CRIs).",
    lessons: [
      {
        title: "FIIs de Tijolo: Localização, ABL e Vacância",
        content: "Olhe onde estão os galpões ou prédios (imóveis 'Raio 30km de SP' têm maior demanda). Avalie a Vacância Física (imóveis vazios) e Financeira (imóveis sem pagar aluguel). Prefira contratos Atípicos de longo prazo (BTS) ou múltiplos inquilinos com empresas de primeira linha."
      },
      {
        title: "FIIs de Papel: Quem são os Devedores e Garantias?",
        content: "FIIs de papel não têm prédios, têm títulos de dívida (CRIs). Olhe a taxa média (ex: IPCA + 7% ou CDI + 2.5%), o LTV (Loan-to-Value, ideal < 60%) e se as garantias reais são sólidas (alienação fiduciária do imóvel)."
      },
      {
        title: "O P/VP em FIIs",
        content: "Em FIIs, o Preço sobre Valor Patrimonial (P/VP) mede se você está pagando mais ou menos do que o laudo de avaliação dos imóveis. P/VP abaixo de 1.00 indica desconto patrimonial."
      }
    ]
  },
  {
    id: "track-04",
    title: "4. Mercado Internacional, ETFs e Renda Fixa",
    badge: "Diversificação Global",
    description: "Como dolarizar parte da sua carteira e gerenciar sua reserva de oportunidade.",
    lessons: [
      {
        title: "Por que ter Ativos em Dólar?",
        content: "O Dólar é a moeda de reserva global. Ter ações e REITs nos EUA protege seu patrimônio contra a desvalorização do Real e inflação de commodities globais."
      },
      {
        title: "Tesouro Direto & CDBs com FGC",
        content: "O Tesouro Selic serve para Reserva de Emergência e Oportunidade. O Tesouro IPCA+ garante rentabilidade acima da inflação para o longo prazo. CDBs de bancos médios devem ter a proteção do FGC (até R$ 250.000 por CPF/instituição)."
      }
    ]
  }
];

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    INVESTOR_ACADEMY_TRACKS
  };
}