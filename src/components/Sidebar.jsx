import {
  LayoutDashboard,
  GitCompare,
  Target,
  Newspaper,
  CalendarDays,
  Microscope,
  TrendingUp,
  GraduationCap,
  Award,
  Receipt,
  Plus,
  HelpCircle,
  LogOut,
} from "lucide-react";

/**
 * Sidebar - Menu lateral Previdência Invest
 * Spec: React + Tailwind CSS + lucide-react
 * - Fixo na lateral esquerda (w-[260px]), fundo branco, texto cinza médio com hover verde/cinza escuro
 * - Item ativo: Dashboard & Carteira com fundo verde claro e borda lateral
 * - Organização vertical com espaçamento padrão entre itens
 *
 * @param {string} activeItem - id do item ativo (ex: "dashboard")
 * @param {(id: string) => void} onNavigate - callback ao clicar em um item de navegação
 * @param {() => void} onNewAporte - callback do botão "Novo Aporte"
 * @param {() => void} onSupport - callback Suporte
 * @param {() => void} onLogout - callback Sair
 */
const NAV_ITEMS = [
  { id: "dashboard", label: "Dashboard & Carteira", icon: LayoutDashboard },
  { id: "comparador", label: "Comparador de Classes", icon: GitCompare },
  { id: "radar", label: "Radar do Pregão", icon: Target },
  { id: "noticias", label: "Notícias do Mercado", icon: Newspaper },
  { id: "dividendos", label: "Mapa do Dividendo", icon: CalendarDays },
  { id: "raiox", label: "Raio-X de Ativos", icon: Microscope },
  { id: "performance", label: "Performance", icon: TrendingUp },
  { id: "academia", label: "Academia do Investidor", icon: GraduationCap },
  { id: "liberdade", label: "Liberdade Financeira", icon: Award },
  { id: "ir", label: "IR & DARF", icon: Receipt },
];

const FOOTER_ITEMS = [
  { id: "suporte", label: "Suporte", icon: HelpCircle },
  { id: "sair", label: "Sair", icon: LogOut },
];

function NavButton({ item, isActive, onClick }) {
  const Icon = item.icon;
  if (isActive) {
    return (
      <button
        type="button"
        aria-current="page"
        onClick={onClick}
        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg bg-emerald-50 text-emerald-800 border-l-4 border-emerald-600 font-medium text-sm text-left transition-colors"
      >
        <Icon className="w-[18px] h-[18px] shrink-0 text-emerald-700" aria-hidden="true" />
        <span>{item.label}</span>
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-gray-600 hover:text-gray-900 hover:bg-gray-50 hover:text-emerald-700 font-medium text-sm text-left transition-colors"
    >
      <Icon className="w-[18px] h-[18px] shrink-0" aria-hidden="true" />
      <span>{item.label}</span>
    </button>
  );
}

export default function Sidebar({
  activeItem = null,
  onNavigate,
  onNewAporte,
  onSupport,
  onLogout,
  className = "",
}) {
  const handleNav = (id) => {
    if (typeof onNavigate === "function") onNavigate(id);
  };

  return (
    <aside
      aria-label="Menu lateral principal"
      className={`fixed left-0 top-0 h-screen w-[260px] bg-white border-r border-gray-100 flex flex-col overflow-hidden z-40 ${className}`}
    >
      {/* Logo / Título */}
      <div className="px-6 pt-6 pb-5 border-b border-gray-100 shrink-0">
        <h1 className="text-[18px] font-bold tracking-tight leading-none text-gray-900">
          Previdência <span className="text-emerald-700">Invest</span>
        </h1>
        <p className="text-xs font-medium text-gray-500 mt-1 tracking-wide">
          Seu Futuro Financeiro
        </p>
      </div>

      {/* Navegação principal */}
      <nav className="flex-1 px-3 py-4 flex flex-col gap-1 overflow-y-auto custom-scrollbar" aria-label="Navegação principal">
        {NAV_ITEMS.map((item) => (
          <NavButton
            key={item.id}
            item={item}
            isActive={activeItem === item.id}
            onClick={() => handleNav(item.id)}
          />
        ))}

        {/* Botão Novo Aporte - destaque verde escuro */}
        <button
          type="button"
          onClick={onNewAporte}
          className="mt-4 w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-emerald-800 hover:bg-emerald-700 text-white text-sm font-semibold shadow-sm transition-colors active:scale-[0.98]"
        >
          <Plus className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span>Novo Aporte</span>
        </button>
      </nav>

      {/* Rodapé - Suporte e Sair */}
      <div className="shrink-0 border-t border-gray-100 px-3 py-3 flex flex-col gap-1">
        <button
          type="button"
          onClick={onSupport}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-gray-600 hover:text-gray-900 hover:bg-gray-50 font-medium text-sm text-left transition-colors"
        >
          <HelpCircle className="w-[18px] h-[18px] shrink-0" aria-hidden="true" />
          <span>Suporte</span>
        </button>
        <button
          type="button"
          onClick={onLogout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-gray-600 hover:text-rose-700 hover:bg-rose-50 font-medium text-sm text-left transition-colors"
        >
          <LogOut className="w-[18px] h-[18px] shrink-0" aria-hidden="true" />
          <span>Sair</span>
        </button>
      </div>
    </aside>
  );
}

// Variante compatível com sistema de tabs legado (data-tab) se necessário
export function SidebarWithTabs({ activeTab = null, onTabChange, ...rest }) {
  const tabToId = {
    "tab-dashboard": "dashboard",
    "tab-classes": "comparador",
    "tab-radar": "radar",
    "tab-noticias": "noticias",
    "tab-mdi": "dividendos",
    "tab-raiox": "raiox",
    "tab-performance": "performance",
    "tab-academia": "academia",
    "tab-liberdade": "liberdade",
    "tab-fiscal": "ir",
  };
  const idToTab = Object.fromEntries(Object.entries(tabToId).map(([k, v]) => [v, k]));
  const activeId = activeTab ? (tabToId[activeTab] || null) : null;
  const handleNavigate = (id) => {
    if (typeof onTabChange === "function") {
      const tab = idToTab[id];
      if (tab) onTabChange(tab);
    }
    if (typeof rest.onNavigate === "function") rest.onNavigate(id);
  };
  return <Sidebar activeItem={activeId} onNavigate={handleNavigate} {...rest} />;
}
