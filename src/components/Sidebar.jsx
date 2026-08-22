import {
  LayoutDashboard,
  GitCompare,
  Radar,
  Newspaper,
  CalendarDays,
  ScanSearch,
  ChartLine,
  GraduationCap,
  Award,
  ReceiptText,
  Plus,
  HelpCircle,
  LogOut,
} from "lucide-react";

/**
 * Sidebar - Menu lateral Previdência Invest
 * Spec: React + Tailwind CSS + lucide-react
 * Estilo moderno: chips de ícone arredondados com tint colorido por item
 * (w-9 h-9 rounded-xl bg-*-50 border-*-100 text-*-600) + label e descrição.
 *
 * @param {string|null} activeItem - id do item ativo (ex: "dashboard")
 * @param {(id: string) => void} onNavigate - callback ao clicar em um item de navegação
 * @param {() => void} onNewAporte - callback do botão "Novo Aporte"
 * @param {() => void} onSupport - callback Suporte
 * @param {() => void} onLogout - callback Sair
 */
const NAV_ITEMS = [
  { id: "dashboard", label: "Dashboard & Carteira", desc: "Visão geral e ativos", icon: LayoutDashboard, chip: "bg-emerald-50 text-emerald-600 border-emerald-100 group-hover:bg-emerald-100" },
  { id: "comparador", label: "Comparador de Classes", desc: "ON · PN · UNIT", icon: GitCompare, chip: "bg-teal-50 text-teal-600 border-teal-100 group-hover:bg-teal-100" },
  { id: "radar", label: "Radar do Pregão", desc: "Margem Bazin", icon: Radar, chip: "bg-amber-50 text-amber-500 border-amber-100 group-hover:bg-amber-100" },
  { id: "noticias", label: "Notícias do Mercado", desc: "Compilado diário", icon: Newspaper, chip: "bg-sky-50 text-sky-600 border-sky-100 group-hover:bg-sky-100" },
  { id: "dividendos", label: "Mapa do Dividendo", desc: "Janelas de pagamento", icon: CalendarDays, chip: "bg-indigo-50 text-indigo-600 border-indigo-100 group-hover:bg-indigo-100" },
  { id: "raiox", label: "Raio-X de Ativos", desc: "Análise profunda", icon: ScanSearch, chip: "bg-cyan-50 text-cyan-600 border-cyan-100 group-hover:bg-cyan-100" },
  { id: "performance", label: "Performance", desc: "Ranking e retornos", icon: ChartLine, chip: "bg-violet-50 text-violet-600 border-violet-100 group-hover:bg-violet-100" },
  { id: "academia", label: "Academia do Investidor", desc: "Trilhas de estudo", icon: GraduationCap, chip: "bg-emerald-50 text-emerald-700 border-emerald-100 group-hover:bg-emerald-100" },
  { id: "liberdade", label: "Liberdade Financeira", desc: "Simulador de meta", icon: Award, chip: "bg-pink-50 text-pink-500 border-pink-100 group-hover:bg-pink-100" },
  { id: "ir", label: "IR & DARF", desc: "Cálculo mensal", icon: ReceiptText, chip: "bg-orange-50 text-orange-500 border-orange-100 group-hover:bg-orange-100" },
];

function NavButton({ item, isActive, onClick }) {
  const Icon = item.icon;
  const activeCls = isActive
    ? "bg-[rgba(0,81,63,0.08)] border-[rgba(0,81,63,0.15)]"
    : "border-transparent hover:bg-[rgba(0,81,63,0.05)] hover:border-[rgba(0,81,63,0.08)]";
  return (
    <button
      type="button"
      aria-current={isActive ? "page" : undefined}
      onClick={onClick}
      className={`group w-full flex items-center justify-start gap-3 px-2.5 py-2 rounded-xl border transition-all duration-200 text-sm font-medium text-left ${activeCls}`}
    >
      <span
        className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 transition-all duration-200 group-hover:scale-105 ${item.chip}`}
      >
        <Icon className="w-[18px] h-[18px]" aria-hidden="true" />
      </span>
      <span className="flex flex-col items-start leading-tight min-w-0">
        <span className="truncate w-full">{item.label}</span>
        <span className="text-[10px] font-normal text-gray-500 truncate w-full">{item.desc}</span>
      </span>
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
  return (
    <aside
      aria-label="Menu lateral principal"
      className={`fixed left-0 top-0 h-screen w-[260px] bg-white border-r border-gray-100 flex flex-col overflow-hidden z-40 ${className}`}
    >
      {/* Logo / Título */}
      <div className="px-5 pt-6 pb-5 border-b border-gray-100 shrink-0">
        <h1 className="text-[18px] font-bold tracking-tight leading-none text-gray-900">
          Previdência <span className="text-emerald-700">Invest</span>
        </h1>
        <p className="text-xs font-medium text-gray-500 mt-1 tracking-wide">
          Seu Futuro Financeiro
        </p>
      </div>

      {/* Navegação principal */}
      <nav className="flex-1 px-3 py-4 flex flex-col gap-0.5 overflow-y-auto custom-scrollbar" aria-label="Navegação principal">
        {NAV_ITEMS.map((item) => (
          <NavButton
            key={item.id}
            item={item}
            isActive={activeItem === item.id}
            onClick={() => typeof onNavigate === "function" && onNavigate(item.id)}
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
      <div className="shrink-0 border-t border-gray-100 px-3 py-3 flex flex-col gap-0.5">
        <button
          type="button"
          onClick={onSupport}
          className="group w-full flex items-center gap-3 px-2.5 py-2 rounded-xl border border-transparent hover:bg-gray-50 hover:border-gray-200 transition-all duration-200 font-medium text-sm text-left"
        >
          <span className="w-9 h-9 rounded-xl bg-gray-50 text-gray-600 border border-gray-100 flex items-center justify-center shrink-0 transition-all duration-200 group-hover:bg-gray-100">
            <HelpCircle className="w-[18px] h-[18px]" aria-hidden="true" />
          </span>
          <span>Suporte</span>
        </button>
        <button
          type="button"
          onClick={onLogout}
          className="group w-full flex items-center gap-3 px-2.5 py-2 rounded-xl border border-transparent hover:bg-rose-50 hover:border-rose-100 transition-all duration-200 font-medium text-sm text-left"
        >
          <span className="w-9 h-9 rounded-xl bg-rose-50 text-rose-600 border border-rose-100 flex items-center justify-center shrink-0 transition-all duration-200 group-hover:bg-rose-100">
            <LogOut className="w-[18px] h-[18px]" aria-hidden="true" />
          </span>
          <span>Sair</span>
        </button>
      </div>
    </aside>
  );
}

// Variante compatível com sistema de tabs legado (data-tab)
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
