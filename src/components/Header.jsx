import { Search, ArrowUp, ArrowDown, Bell, ChevronDown } from "lucide-react";

/**
 * Header - Previdência Invest
 * Layout conforme spec: flex items-center justify-between w-full px-6 py-3 bg-white border-b border-gray-100
 *
 * - Esquerda: busca w-80 (320px) com ícone Search, bg-gray-50, border-gray-200, rounded-lg
 * - Centro: ticker IBOV/DÓLAR/SELIC
 * - Direita: Bell com dot amber-500 + avatar w-8 h-8 rounded-full border + ChevronDown
 */
export default function Header({
  searchPlaceholder = "Buscar ativos, relatórios...",
  onSearchChange,
  searchValue,
  ibovValue = "+1.2%",
  dolarValue = "-0.5%",
  selicValue = "10.75%",
  avatarSrc = "",
  avatarAlt = "Avatar do usuário",
  onBellClick,
  onProfileClick,
  onReportClick,
  unreadNotifications = true,
}) {
  return (
    <header className="flex items-center justify-between w-full px-6 py-3 bg-white border-b border-gray-100">
      {/* Lado Esquerdo — Campo de Busca */}
      <div className="relative w-80 shrink-0">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" aria-hidden="true" />
        <input
          id="header-search"
          type="text"
          value={searchValue}
          onChange={onSearchChange}
          placeholder={searchPlaceholder}
          aria-label="Buscar ativos, relatórios"
          className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 placeholder:text-gray-400 placeholder:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500/30 transition"
        />
      </div>

      {/* Centro — Indicadores de Mercado (Ticker) */}
      <div className="flex items-center gap-6 shrink-0">
        {/* IBOV +1.2% */}
        <div className="flex items-center gap-1.5" aria-label="IBOV em alta de 1.2%">
          <ArrowUp className="w-4 h-4 text-emerald-600 shrink-0" aria-hidden="true" />
          <span className="text-sm font-bold text-emerald-600 whitespace-nowrap">IBOV {ibovValue}</span>
        </div>

        {/* DOLAR -0.5% */}
        <div className="flex items-center gap-1.5" aria-label="Dólar em queda de 0.5%">
          <ArrowDown className="w-4 h-4 text-rose-500 shrink-0" aria-hidden="true" />
          <span className="text-sm font-bold text-rose-500 whitespace-nowrap">DOLAR {dolarValue}</span>
        </div>

        {/* SELIC 10.75% */}
        <div className="flex items-center gap-1.5 text-sm" aria-label="SELIC 10.75%">
          <span className="text-gray-500 font-medium">SELIC</span>
          <span className="font-bold text-gray-900">{selicValue}</span>
        </div>
      </div>

      {/* Lado Direito — Ações e Perfil: Relatório, Bell com dot amber-500, Avatar w-8 h-8 rounded-full + ChevronDown */}
      <div className="flex items-center gap-4 shrink-0">
        {/* Relatório */}
        <button
          type="button"
          onClick={onReportClick}
          aria-label="Relatório"
          className="px-3 py-2 rounded-lg hover:bg-gray-100 text-gray-600 hover:text-gray-900 text-sm font-medium transition whitespace-nowrap focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
        >
          Relatório
        </button>

        {/* Bell com bolinha amber-500 */}
        <button
          type="button"
          onClick={onBellClick}
          aria-label="Notificações"
          className="relative p-2 rounded-full hover:bg-gray-100 transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
        >
          <Bell className="w-5 h-5 text-gray-600" aria-hidden="true" />
          {unreadNotifications && (
            <span
              className="absolute top-1 right-1 w-2.5 h-2.5 bg-amber-500 rounded-full border-2 border-white"
              aria-hidden="true"
            />
          )}
        </button>

        {/* Avatar circular w-8 h-8 rounded-full border + ChevronDown */}
        <button
          type="button"
          onClick={onProfileClick}
          aria-label="Abrir menu do perfil"
          className="flex items-center gap-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 rounded-full p-0.5"
        >
          {avatarSrc ? (
            <img
              src={avatarSrc}
              alt={avatarAlt}
              className="w-8 h-8 rounded-full border border-gray-200 object-cover"
            />
          ) : (
            <img
              src="https://i.pravatar.cc/100?img=12"
              alt={avatarAlt}
              className="w-8 h-8 rounded-full border border-gray-200 object-cover"
            />
          )}
          <ChevronDown className="w-4 h-4 text-gray-500 shrink-0" aria-hidden="true" />
        </button>
      </div>
    </header>
  );
}

// Variância compatível com o vanilla app (ids preservados para investor-app.js)
export function HeaderVanillaCompatible(props) {
  return <Header {...props} />;
}
