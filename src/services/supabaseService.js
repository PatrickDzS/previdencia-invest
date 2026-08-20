/**
 * Serviço de Integração Supabase (Auth + Banco PostgreSQL + RLS)
 * Conexão automática via variáveis de ambiente configuradas no backend
 * (injetadas no build pela Vercel através de scripts/build-env.js).
 * Fallback para localStorage apenas para compatibilidade com versões antigas.
 */

const SUPABASE_STORAGE_KEY = "previdencia_invest_supabase_config";

// Obter configurações do Supabase: prioridade = config injetada no build (env vars)
function getSupabaseConfig() {
  // 1. Config gerada no build pelos env vars do backend
  if (typeof window !== 'undefined' && window.SUPABASE_CONFIG && window.SUPABASE_CONFIG.url && window.SUPABASE_CONFIG.anonKey) {
    return {
      url: window.SUPABASE_CONFIG.url,
      anonKey: window.SUPABASE_CONFIG.anonKey,
      source: "env (build)"
    };
  }

  // 2. Fallback: variáveis de ambiente padrão
  if (typeof window !== 'undefined' && window.NEXT_PUBLIC_SUPABASE_URL && window.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return {
      url: window.NEXT_PUBLIC_SUPABASE_URL,
      anonKey: window.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      source: "env (inline)"
    };
  }

  // 3. Ultimo recurso: config salva localmente (versões antigas do app)
  try {
    const raw = localStorage.getItem(SUPABASE_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.url && parsed.anonKey) {
        return { url: parsed.url, anonKey: parsed.anonKey, source: "local" };
      }
    }
  } catch (e) {}

  return null;
}

function saveSupabaseConfig(url, anonKey) {
  try {
    localStorage.setItem(SUPABASE_STORAGE_KEY, JSON.stringify({ url: url.trim(), anonKey: anonKey.trim() }));
    initSupabaseClient();
    return true;
  } catch (e) {
    return false;
  }
}

// Instância do Cliente Supabase
let supabaseClient = null;

function initSupabaseClient() {
  const config = getSupabaseConfig();
  if (config && config.url && config.anonKey && typeof window !== 'undefined' && window.supabase) {
    try {
      supabaseClient = window.supabase.createClient(config.url, config.anonKey);
    } catch (err) {
      console.warn("Erro ao instanciar cliente Supabase:", err);
      supabaseClient = null;
    }
  }
  return supabaseClient;
}

// 1. Cadastro de Usuário
async function signUpUser(email, password, fullName = "") {
  const client = initSupabaseClient();
  if (!client) throw new Error("Supabase não configurado. Por favor, insira a URL e a Anon Key no modal.");

  const { data, error } = await client.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName }
    }
  });

  if (error) throw error;
  return data;
}

// 2. Login com E-mail e Senha
async function signInUser(email, password) {
  const client = initSupabaseClient();
  if (!client) throw new Error("Supabase não configurado. Por favor, insira a URL e a Anon Key no modal.");

  const { data, error } = await client.auth.signInWithPassword({
    email,
    password
  });

  if (error) throw error;
  return data;
}

// 3. Logout
async function signOutUser() {
  const client = initSupabaseClient();
  if (client) {
    await client.auth.signOut();
  }
}

// 3.1 Login com Google (OAuth) - redireciona para o fluxo do provedor
async function signInWithGoogle() {
  const client = initSupabaseClient();
  if (!client) throw new Error("Supabase não configurado. Por favor, insira a URL e a Anon Key no modal.");

  const { data, error } = await client.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.origin + window.location.pathname
    }
  });

  if (error) throw error;
  return data;
}

// 3.2 Recuperação de senha via e-mail
async function resetPasswordForEmail(email) {
  const client = initSupabaseClient();
  if (!client) throw new Error("Supabase não configurado. Por favor, insira a URL e a Anon Key no modal.");

  const { data, error } = await client.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin + window.location.pathname
  });

  if (error) throw error;
  return data;
}

// 3.3 Atualizar dados do usuário logado (nome, avatar, etc.)
async function updateUser(attributes) {
  const client = initSupabaseClient();
  if (!client) throw new Error("Supabase não configurado.");

  const { data, error } = await client.auth.updateUser(attributes);
  if (error) throw error;
  return data;
}

// 3.4 Alterar senha do usuário logado
async function updateUserPassword(newPassword) {
  const client = initSupabaseClient();
  if (!client) throw new Error("Supabase não configurado.");

  const { data, error } = await client.auth.updateUser({ password: newPassword });
  if (error) throw error;
  return data;
}

// 4. Obter Usuário Atual da Sessão
async function getLoggedUser() {
  const client = initSupabaseClient();
  if (!client) return null;

  try {
    const { data: { user } } = await client.auth.getUser();
    return user;
  } catch (e) {
    return null;
  }
}

// 4.1 Obter sessão local (funciona offline; validação do servidor é feita por getLoggedUser)
function getSessionUser() {
  const client = initSupabaseClient();
  if (!client) return null;

  try {
    const { data: { session } } = client.auth.getSession();
    return session?.user || null;
  } catch (e) {
    return null;
  }
}

// 4.2 Ouvinte de mudanças de autenticação (login, logout, OAuth, refresh de sessão)
function onAuthStateChange(callback) {
  const client = initSupabaseClient();
  if (!client || typeof callback !== 'function') return null;

  try {
    const { data: { subscription } } = client.auth.onAuthStateChange((event, session) => {
      callback(event, session?.user || null);
    });
    return subscription;
  } catch (e) {
    return null;
  }
}

// 5. Salvar / Sincronizar Carteira na Nuvem (PostgreSQL com RLS)
async function syncPortfolioToCloud(portfolio) {
  const client = initSupabaseClient();
  const user = await getLoggedUser();

  if (!client || !user) {
    // Se não estiver logado, salva apenas no LocalStorage
    localStorage.setItem('previdencia_invest_portfolio', JSON.stringify(portfolio));
    return { synced: false, reason: "Modo Local (Não Autenticado)" };
  }

  try {
    // 1. Upsert da Carteira Principal
    const { data: portfolioData, error: portError } = await client
      .from('portfolios')
      .upsert({
        user_id: user.id,
        name: portfolio.name || 'Carteira Principal',
        target_allocations: portfolio.targetAllocations || {},
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id' })
      .select()
      .single();

    if (portError) throw portError;

    const portfolioId = portfolioData?.id;

    // 2. Salvar Ativos
    if (portfolio.assets && portfolio.assets.length > 0 && portfolioId) {
const dbAssets = portfolio.assets.map(a => ({
        portfolio_id: portfolioId,
        user_id: user.id,
        ticker: a.ticker,
        name: a.name,
        type: a.type,
        quantity: a.quantity || 0,
        average_price: a.averagePrice || 0,
        target_weight_percent: a.targetWeightPercent || 10,
        target_annual_yield: a.targetAnnualYield || 0.06,
        historical_dpa_estimate: a.historicalAverageDPA || 0,
        monthly_dividend_estimate: a.monthlyDividendEstimate || 0,
        score: a.score || 9,
        deep_dive_data: a.deepDive || {},
        updated_at: new Date().toISOString()
      }));

      await client.from('assets').upsert(dbAssets, { onConflict: 'portfolio_id,ticker' });
    }

    // Salva cópia local
    localStorage.setItem('previdencia_invest_portfolio', JSON.stringify(portfolio));
    return { synced: true, user: user.email };
  } catch (err) {
    console.error("Erro ao sincronizar com Supabase:", err);
    throw err;
  }
}

// 6. Carregar Carteira da Nuvem
async function loadPortfolioFromCloud() {
  const client = initSupabaseClient();
  const user = await getLoggedUser();

  if (!client || !user) return null;

  try {
    const { data: portData } = await client
      .from('portfolios')
      .select('*, assets(*)')
      .eq('user_id', user.id)
      .single();

    if (portData && portData.assets) {
      const loaded = {
        id: portData.id,
        name: portData.name,
        targetAllocations: portData.target_allocations || {},
assets: portData.assets.map(dbA => ({
          id: dbA.id,
          ticker: dbA.ticker,
          name: dbA.name,
          type: dbA.type,
          quantity: Number(dbA.quantity) || 0,
          averagePrice: Number(dbA.average_price) || 0,
          currentPrice: Number(dbA.average_price) || 0,
          targetWeightPercent: dbA.target_weight_percent,
          targetAnnualYield: dbA.target_annual_yield,
          historicalAverageDPA: dbA.historical_dpa_estimate,
          monthlyDividendEstimate: dbA.monthly_dividend_estimate,
          score: dbA.score,
          deepDive: dbA.deep_dive_data
        }))
      };
      return loaded;
    }
  } catch (e) {
    console.warn("Erro ao buscar carteira da nuvem:", e);
  }

return null;
}

// 7. Sincronizar Alertas do Centro de Notificações na Nuvem (PostgreSQL com RLS)
async function syncNotificationsToCloud(alerts = []) {
  const client = initSupabaseClient();
  const user = await getLoggedUser();

  if (!client || !user || !alerts || alerts.length === 0) {
    return { synced: false };
  }

  try {
    const rows = alerts.slice(0, 50).map(a => ({
      user_id: user.id,
      alert_key: a.id,
      category: a.category,
      severity: a.severity,
      ticker: a.ticker || null,
      title: a.title,
      message: a.message,
      action_advice: a.actionAdvice || null
    }));

    const { error } = await client
      .from('notifications')
      .upsert(rows, { onConflict: 'user_id,alert_key' });

    if (error) throw error;
    return { synced: true };
  } catch (err) {
    console.warn("Erro ao sincronizar notificações com Supabase:", err);
    return { synced: false };
  }
}

// 8. Carregar Alertas do Centro de Notificações da Nuvem
async function loadNotificationsFromCloud() {
  const client = initSupabaseClient();
  const user = await getLoggedUser();

  if (!client || !user) return [];

  try {
    const { data, error } = await client
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw error;

    return (data || []).map(n => ({
      id: n.alert_key,
      category: n.category,
      severity: n.severity,
      ticker: n.ticker,
      title: n.title,
      message: n.message,
      actionAdvice: n.action_advice,
      isRead: n.is_read || false,
      createdAt: n.created_at
    }));
  } catch (err) {
    console.warn("Erro ao buscar notificações da nuvem:", err);
    return [];
  }
}

// 9. Marcar notificação como lida
async function markNotificationRead(alertKey) {
  const client = initSupabaseClient();
  const user = await getLoggedUser();

  if (!client || !user || !alertKey) return { synced: false };

  try {
    const { error } = await client
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', user.id)
      .eq('alert_key', alertKey);

    if (error) throw error;
    return { synced: true };
  } catch (err) {
    console.warn("Erro ao marcar notificação como lida:", err);
    return { synced: false };
  }
}

// 10. Sincronizar cálculo mensal de IR & DARF com a nuvem
async function syncMonthlyTaxToCloud(record) {
  const client = initSupabaseClient();
  const user = await getLoggedUser();

  if (!client || !user || !record || !record.yearMonth) {
    return { synced: false };
  }

  try {
    const { error } = await client
      .from('monthly_taxes')
      .upsert({
        user_id: user.id,
        year_month: record.yearMonth,
        total_stock_sales: record.totalStockSales || 0,
        is_stock_exempt: record.isStockExempt ?? true,
        stock_realized_profit: record.stockRealizedProfit || 0,
        stock_taxable_profit: record.stockTaxableProfit || 0,
        stock_darf_payable: record.stockDarfPayable || 0,
        stock_loss_carried: record.stockLossCarried || 0,
        fii_realized_profit: record.fiiRealizedProfit || 0,
        fii_taxable_profit: record.fiiTaxableProfit || 0,
        fii_darf_payable: record.fiiDarfPayable || 0,
        fii_loss_carried: record.fiiLossCarried || 0,
        total_darf_payable: record.totalDarfPayable || 0
      }, { onConflict: 'user_id,year_month' });

    if (error) throw error;
    return { synced: true };
  } catch (err) {
    console.warn("Erro ao sincronizar cálculo de IR & DARF:", err);
    return { synced: false };
  }
}

// 11. Carregar cálculo mensal de IR & DARF da nuvem
async function loadMonthlyTaxFromCloud(yearMonth) {
  const client = initSupabaseClient();
  const user = await getLoggedUser();

  if (!client || !user || !yearMonth) return null;

  try {
    const { data, error } = await client
      .from('monthly_taxes')
      .select('*')
      .eq('user_id', user.id)
      .eq('year_month', yearMonth)
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;

    return {
      yearMonth: data.year_month,
      inputs: {
        stockSales: [{ sellAmount: Number(data.total_stock_sales) || 0, costAmount: 0, profit: Number(data.stock_realized_profit) || 0 }],
        fiiSales: [{ sellAmount: 0, costAmount: 0, profit: Number(data.fii_realized_profit) || 0 }],
        accumulatedStockLossCarried: Number(data.stock_loss_carried) || 0,
        accumulatedFiiLossCarried: Number(data.fii_loss_carried) || 0
      },
      tax: {
        totalStockSalesAmount: Number(data.total_stock_sales) || 0,
        isStockExempt: !!data.is_stock_exempt,
        stockRealizedProfit: Number(data.stock_realized_profit) || 0,
        stockTaxableProfit: Number(data.stock_taxable_profit) || 0,
        stockDarfPayable: Number(data.stock_darf_payable) || 0,
        newStockLossCarried: Number(data.stock_loss_carried) || 0,
        totalFiiSalesAmount: 0,
        fiiRealizedProfit: Number(data.fii_realized_profit) || 0,
        fiiTaxableProfit: Number(data.fii_taxable_profit) || 0,
        fiiDarfPayable: Number(data.fii_darf_payable) || 0,
        newFiiLossCarried: Number(data.fii_loss_carried) || 0,
        totalDarfPayable: Number(data.total_darf_payable) || 0
      }
    };
  } catch (err) {
    console.warn("Erro ao buscar cálculo de IR & DARF da nuvem:", err);
    return null;
  }
}

if (typeof module !== 'undefined') {
  module.exports = {
    getSupabaseConfig,
    saveSupabaseConfig,
    signUpUser,
    signInUser,
    signInWithGoogle,
    resetPasswordForEmail,
    updateUser,
    updateUserPassword,
    signOutUser,
    getLoggedUser,
    getSessionUser,
    onAuthStateChange,
    syncPortfolioToCloud,
    loadPortfolioFromCloud,
    syncNotificationsToCloud,
    loadNotificationsFromCloud,
    markNotificationRead,
    syncMonthlyTaxToCloud,
    loadMonthlyTaxFromCloud
  };
}
