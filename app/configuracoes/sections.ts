export const settingsGroups = [
  { label: "Geral", items: [{ id: "visao-geral", title: "Visão geral das configurações", icon: "settings", access: "account" }] },
  { label: "Minha conta", items: [
    { id: "meus-dados", title: "Meus dados", icon: "user", access: "account" },
    { id: "seguranca", title: "Segurança", icon: "shield", access: "account" },
    { id: "mudar-senha", title: "Mudar senha", icon: "key", access: "account" },
    { id: "preferencias-email", title: "Preferências de e-mail", icon: "mail", access: "account" },
    { id: "politica-da-empresa", title: "Política de despesa da minha empresa", icon: "file", access: "account" },
  ] },
  { label: "Empresa", items: [
    { id: "dados-empresa", title: "Dados da empresa", icon: "building", access: "admin" },
    { id: "departamentos-cargos", title: "Departamentos e cargos", icon: "network", access: "admin" },
    { id: "membros-equipe", title: "Membros de equipe", icon: "users", access: "admin" },
    { id: "centros-custo", title: "Centros de custos", icon: "landmark", access: "admin" },
    { id: "projetos", title: "Projetos", icon: "folder", access: "admin" },
    { id: "financeiro", title: "Financeiro", icon: "ledger", access: "finance" },
  ] },
  { label: "Operacional", items: [
    { id: "formas-pagamento", title: "Formas de pagamento", icon: "wallet", access: "admin" },
    { id: "tipos-despesa", title: "Tipos de despesa", icon: "list", access: "admin" },
    { id: "fluxos-aprovacao", title: "Fluxos de aprovação", icon: "checklist", access: "admin" },
    { id: "integracoes", title: "Integrações", icon: "plug", access: "admin" },
  ] },
  { label: "Políticas", items: [
    { id: "despesas", title: "Despesas", icon: "file", access: "admin" },
    { id: "quilometragem", title: "Quilometragem", icon: "car", access: "admin" },
  ] },
] as const;

type SettingsItem = (typeof settingsGroups)[number]["items"][number];
export type SettingsSection = SettingsItem["id"];
export const allSettings = settingsGroups.flatMap(({ items }): SettingsItem[] => [...items]);
export const accountSections = ["meus-dados", "seguranca", "mudar-senha", "preferencias-email"] as const;
export function isAccountSection(section: string): section is (typeof accountSections)[number] {
  return accountSections.some((value) => value === section);
}
export function settingsHref(section: SettingsSection) {
  return section === "visao-geral" ? "/configuracoes" : `/configuracoes?secao=${section}`;
}
export function canSeeSettings(item: SettingsItem, role?: string, hasCompany = false) {
  return item.access === "account" || role === "admin" ||
    (item.access === "finance" && role === "finance") ||
    (item.id === "dados-empresa" && !hasCompany);
}
export function settingsSearchKey(value: string) {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("pt-BR").trim();
}
