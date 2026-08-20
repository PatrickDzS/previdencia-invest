-- ==============================================================================
-- SCHEMA DO SUPABASE PARA A PLATAFORMA PREVIDENCIÁRIA DE INVESTIMENTOS
-- Segurança Máxima com Row Level Security (RLS) e PostgreSQL Nativo
-- ==============================================================================

-- Habilitar extensão de UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Tabela de Perfis de Usuário
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email TEXT NOT NULL,
  full_name TEXT,
  monthly_passive_income_goal NUMERIC(12, 2) DEFAULT 5000.00,
  expected_annual_yield NUMERIC(5, 4) DEFAULT 0.0850, -- 8.5%
  monthly_contribution_plan NUMERIC(12, 2) DEFAULT 1500.00,
  reinvest_dividends BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ativar RLS para profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuários podem ver seu próprio perfil" 
  ON public.profiles FOR SELECT 
  USING (auth.uid() = id);

CREATE POLICY "Usuários podem atualizar seu próprio perfil" 
  ON public.profiles FOR UPDATE 
  USING (auth.uid() = id);

-- 2. Tabela de Carteiras
CREATE TABLE IF NOT EXISTS public.portfolios (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL DEFAULT 'Carteira Principal',
  description TEXT,
  target_allocations JSONB DEFAULT '{"ACAO": 35, "FII_TIJOLO": 25, "FII_PAPEL": 15, "STOCK_USD": 10, "RENDA_FIXA": 15}'::jsonb,
  is_default BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.portfolios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuários gerenciam suas próprias carteiras" 
  ON public.portfolios FOR ALL 
  USING (auth.uid() = user_id);

-- 3. Tabela de Ativos da Carteira
CREATE TABLE IF NOT EXISTS public.assets (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  portfolio_id UUID REFERENCES public.portfolios(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  ticker TEXT NOT NULL,
  name TEXT NOT NULL,
type TEXT NOT NULL CHECK (type IN ('ACAO', 'FII_TIJOLO', 'FII_PAPEL', 'FII_FIBRA', 'FII_FOF', 'STOCK_USD', 'REIT_USD', 'ETF', 'RENDA_FIXA')),
  quantity NUMERIC(14, 4) DEFAULT 0,
  average_price NUMERIC(14, 4) DEFAULT 0,
  target_weight_percent NUMERIC(5, 2) DEFAULT 5.00,
  target_annual_yield NUMERIC(5, 4) DEFAULT 0.0600, -- 6% padrão Bazin
  historical_dpa_estimate NUMERIC(10, 4) DEFAULT 0.0000,
  monthly_dividend_estimate NUMERIC(10, 4) DEFAULT 0.0000,
  score INTEGER DEFAULT 8 CHECK (score >= 1 AND score <= 10),
  notes TEXT,
  deep_dive_data JSONB DEFAULT '{}'::jsonb, -- Guarda imóveis de FII, CRIs, etc.
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (portfolio_id, ticker)
);

ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuários gerenciam seus próprios ativos" 
  ON public.assets FOR ALL 
  USING (auth.uid() = user_id);

-- 4. Tabela de Transações (Compras, Vendas, Dividendos, Amortizações)
CREATE TABLE IF NOT EXISTS public.transactions (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  portfolio_id UUID REFERENCES public.portfolios(id) ON DELETE CASCADE NOT NULL,
  asset_id UUID REFERENCES public.assets(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  ticker TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('BUY', 'SELL', 'DIVIDEND', 'JCP', 'AMORTIZATION', 'BONIFICATION')),
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  quantity NUMERIC(14, 4) NOT NULL,
  unit_price NUMERIC(14, 4) NOT NULL,
  fees NUMERIC(10, 2) DEFAULT 0.00,
  total_amount NUMERIC(14, 2) NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuários gerenciam suas próprias transações" 
  ON public.transactions FOR ALL 
  USING (auth.uid() = user_id);

-- 5. Tabela de Monitoramento / Watchlist do Pregão
CREATE TABLE IF NOT EXISTS public.watchlist (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  ticker TEXT NOT NULL,
  type TEXT NOT NULL,
  bazin_ceiling_price NUMERIC(10, 2),
  alert_target_price NUMERIC(10, 2),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, ticker)
);

ALTER TABLE public.watchlist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuários gerenciam sua própria watchlist" 
  ON public.watchlist FOR ALL 
  USING (auth.uid() = user_id);

-- 6. Tabela de Histórico Fiscal (IR e DARF)
CREATE TABLE IF NOT EXISTS public.monthly_taxes (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  year_month VARCHAR(7) NOT NULL, -- Ex: '2025-03'
  total_stock_sales NUMERIC(14, 2) DEFAULT 0.00,
  is_stock_exempt BOOLEAN DEFAULT TRUE,
  stock_realized_profit NUMERIC(14, 2) DEFAULT 0.00,
  stock_taxable_profit NUMERIC(14, 2) DEFAULT 0.00,
  stock_darf_payable NUMERIC(14, 2) DEFAULT 0.00,
  stock_loss_carried NUMERIC(14, 2) DEFAULT 0.00,
  fii_realized_profit NUMERIC(14, 2) DEFAULT 0.00,
  fii_taxable_profit NUMERIC(14, 2) DEFAULT 0.00,
  fii_darf_payable NUMERIC(14, 2) DEFAULT 0.00,
  fii_loss_carried NUMERIC(14, 2) DEFAULT 0.00,
  total_darf_payable NUMERIC(14, 2) DEFAULT 0.00,
  is_paid BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, year_month)
);

ALTER TABLE public.monthly_taxes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuários gerenciam seus registros fiscais" 
  ON public.monthly_taxes FOR ALL 
  USING (auth.uid() = user_id);

-- 7. Trigger para Criar Perfil e Carteira Padrão ao Registrar Usuário
CREATE OR REPLACE FUNCTION public.handle_new_user() 
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (new.id, new.email, new.raw_user_meta_data->>'full_name');

  INSERT INTO public.portfolios (user_id, name, is_default)
  VALUES (new.id, 'Minha Carteira Previdenciária', TRUE);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- 8. Tabela de Notificações / Alertas do Centro de Notificações
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  alert_key TEXT NOT NULL,
  category TEXT NOT NULL,
  severity TEXT NOT NULL,
  ticker TEXT,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  action_advice TEXT,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, alert_key)
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuários gerenciam suas próprias notificações" 
  ON public.notifications FOR ALL 
  USING (auth.uid() = user_id);

-- 9. Migração para bancos já existentes (executar com segurança mesmo repetindo)
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS quantity NUMERIC(14, 4) DEFAULT 0;
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS average_price NUMERIC(14, 4) DEFAULT 0;
