# ?? Previdência Invest - Plataforma de Gestão Inteligente & Raio-X de Ativos

Plataforma completa de acompanhamento patrimonial focada em **Geração de Renda Passiva e Dividendos** (Método Décio Bazin & Luiz Barsi), com **Raio-X de Ativos** (Ações, FIIs de Tijolo e Papel, Stocks em USD, ETFs e Renda Fixa), **Comparador de Classes (3 vs 4 vs 11)**, **Mapa do Dividendo Inteligente (MDI)**, **Centro de Notificações & Auditoria de Ativos**, **Calculadora de IR/DARF** e **Simulador de Liberdade Financeira**.

---

## ?? Como Fazer Deploy na Vercel em 2 Minutos

### Opção 1: Via GitHub (Recomendado)
1. Suba este projeto para um repositório no seu GitHub.
2. Acesse [vercel.com](https://vercel.com) e clique em **"Add New Project"**.
3. Selecione o repositório e clique em **Deploy**.
4. *(Opcional)* Nas configurações de Environment Variables da Vercel, adicione:
   * `NEXT_PUBLIC_SUPABASE_URL`: URL do seu projeto Supabase
   * `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Sua chave Anon pública do Supabase

### Opção 2: Via Vercel CLI
Execute no terminal:
```bash
npm i -g vercel
vercel
```

---

## ?? Como Rodar Localmente
Basta abrir o arquivo `index.html` em qualquer navegador ou rodar um servidor estático local:
```bash
npx serve .
```

---

## ?? Como Executar os Testes Unitários
Para validar todo o motor financeiro, importador e regras de auditoria:
```bash
npm test
```
