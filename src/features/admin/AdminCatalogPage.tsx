import { useEffect, useRef, useState } from "react";
import { useOutletContext, useParams } from "react-router";
import type { StaffAccess } from "../auth/staffAuth";
import { getAdminCatalog, saveCatalogEntry } from "./adminCatalog";
import type { AdminCatalog, AdminCategory, AdminProduct } from "./adminCatalog";
import { CatalogEditor } from "./CatalogEditor";
import type { CatalogSelection } from "./CatalogEditor";

const money = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .trim();
}

function IconCube({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m21.12 6.4-6.05-3.46a2 2 0 0 0-2.14 0L6.88 6.4a2 2 0 0 0-1 1.73v6.94a2 2 0 0 0 1 1.73l6.05 3.46a2 2 0 0 0 2.14 0l6.05-3.46a2 2 0 0 0 1-1.73V8.13a2 2 0 0 0-1-1.73z" />
      <path d="M12 22V12" />
      <path d="m3.29 7 8.71 5 8.71-5" />
    </svg>
  );
}

function ProductActionsDropdown({
  product,
  onEdit,
  onToggleAvailability,
  onToggleFeatured,
}: {
  product: AdminProduct;
  onEdit: () => void;
  onToggleAvailability: () => void;
  onToggleFeatured: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="Mais opções do produto"
        aria-label="Mais opções"
        className="p-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors cursor-pointer"
      >
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="1" />
          <circle cx="12" cy="5" r="1" />
          <circle cx="12" cy="19" r="1" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 bottom-full mb-1.5 w-48 rounded-xl shadow-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-1.5 z-40 transition-all">
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onEdit();
            }}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors text-left cursor-pointer"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
            </svg>
            <span>Editar detalhes</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onToggleAvailability();
            }}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors text-left cursor-pointer"
          >
            <span className={`w-2 h-2 rounded-full ${product.available ? "bg-amber-500" : "bg-emerald-500"}`} />
            <span>{product.available ? "Marcar indisponível" : "Marcar disponível"}</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onToggleFeatured();
            }}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors text-left cursor-pointer"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill={product.featured ? "none" : "currentColor"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
            <span>{product.featured ? "Remover destaque" : "Destacar produto"}</span>
          </button>
        </div>
      )}
    </div>
  );
}

export function AdminCatalogPage() {
  const { restaurantSlug = "" } = useParams();
  const access = useOutletContext<StaffAccess>();
  return (
    <CatalogContent
      key={`${restaurantSlug}:${access.memberId}`}
      restaurantSlug={restaurantSlug}
      restaurantId={access.restaurantId}
    />
  );
}

function CatalogContent({
  restaurantSlug,
  restaurantId,
}: {
  restaurantSlug: string;
  restaurantId: string;
}) {
  const [catalog, setCatalog] = useState<AdminCatalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [refresh, setRefresh] = useState(0);

  // Tabs: "todos" | "produtos" | "categorias"
  const [tab, setTab] = useState<"todos" | "produtos" | "categorias">("todos");
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [selection, setSelection] = useState<CatalogSelection | null>(null);

  useEffect(() => {
    let disposed = false;
    setLoading(true);
    setError("");
    async function load() {
      try {
        const result = await getAdminCatalog(restaurantSlug);
        if (!disposed) setCatalog(result);
      } catch (cause) {
        if (!disposed) {
          setCatalog(null);
          setError(
            cause instanceof Error
              ? cause.message
              : "Não foi possível carregar o catálogo.",
          );
        }
      } finally {
        if (!disposed) setLoading(false);
      }
    }
    void load();
    return () => {
      disposed = true;
    };
  }, [restaurantSlug, refresh]);

  function open(sel: CatalogSelection) {
    setNotice("");
    setSelection(sel);
  }

  function saved() {
    setSelection(null);
    setNotice(
      "Alterações salvas. O cardápio público será atualizado em até 60 segundos; recarregue a página para ver agora.",
    );
    setRefresh((value) => value + 1);
  }

  async function toggleAvailability(product: AdminProduct) {
    try {
      await saveCatalogEntry(restaurantSlug, 'product', product.id, product.revision, {
        available: !product.available,
      });
      setRefresh((v) => v + 1);
    } catch (err) {
      console.error('Erro ao alternar disponibilidade:', err);
    }
  }

  async function toggleFeatured(product: AdminProduct) {
    try {
      await saveCatalogEntry(restaurantSlug, 'product', product.id, product.revision, {
        featured: !product.featured,
      });
      setRefresh((v) => v + 1);
    } catch (err) {
      console.error('Erro ao alternar destaque:', err);
    }
  }

  const categories = catalog?.categories ?? [];
  const categoryMap = new Map(
    categories.map((category) => [category.id, category]),
  );

  const search = normalize(query);

  const products = (catalog?.products ?? []).filter(
    (product) =>
      (categoryFilter === "all" || product.category_id === categoryFilter) &&
      normalize(`${product.name} ${product.short_description}`).includes(search),
  );

  const filteredCategories = categories.filter((category) =>
    normalize(category.name).includes(search),
  );

  const totalCount = (catalog?.products.length ?? 0) + categories.length;
  const productsCount = catalog?.products.length ?? 0;
  const categoriesCount = categories.length;

  // Quando estiver no modo de edição/criação, renderiza exclusivamente o editor,
  // ocultando o cabeçalho duplicado "Seu catálogo", abas de listagem e botões de topo.
  if (selection && catalog) {
    return (
      <div className="space-y-6">
        {notice && (
          <div
            role="status"
            className="rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 p-4 text-xs sm:text-sm text-emerald-800 dark:text-emerald-300 font-medium leading-relaxed"
          >
            {notice}
          </div>
        )}
        <CatalogEditor
          key={`${selection.kind}:${selection.entry?.id ?? "new"}`}
          selection={selection}
          categories={categories}
          restaurantSlug={restaurantSlug}
          restaurantId={restaurantId}
          onSaved={saved}
          onCancel={() => setSelection(null)}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 1. CABEÇALHO DA SEÇÃO */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        {/* Lado Esquerdo */}
        <div>
          <div className="flex items-center gap-1.5 text-xs font-bold text-[#610000] dark:text-red-400 uppercase tracking-wider mb-1">
            <IconCube className="w-4 h-4 text-[#610000] dark:text-red-400" />
            <span>Administração</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-zinc-900 dark:text-white tracking-tight">
            Seu catálogo
          </h1>
          <p className="text-xs sm:text-sm text-zinc-600 dark:text-zinc-400 mt-1">
            Organize as categorias e mantenha os produtos e preços atualizados.
          </p>

          {/* 2. ABAS DE CONTAGEM (PILLS) */}
          <div className="flex flex-wrap items-center gap-2 mt-4">
            <button
              type="button"
              disabled={!!selection}
              onClick={() => {
                setTab("todos");
                setQuery("");
              }}
              className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer ${
                tab === "todos"
                  ? "bg-[#610000] text-white shadow-2xs"
                  : "bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-700"
              }`}
            >
              Todos ({totalCount})
            </button>

            <button
              type="button"
              disabled={!!selection}
              onClick={() => {
                setTab("produtos");
                setQuery("");
              }}
              className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer ${
                tab === "produtos"
                  ? "bg-[#610000] text-white shadow-2xs"
                  : "bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-700"
              }`}
            >
              Produtos ({productsCount})
            </button>

            <button
              type="button"
              disabled={!!selection}
              onClick={() => {
                setTab("categorias");
                setQuery("");
              }}
              className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer ${
                tab === "categorias"
                  ? "bg-[#610000] text-white shadow-2xs"
                  : "bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-700"
              }`}
            >
              Categorias ({categoriesCount})
            </button>
          </div>
        </div>

        {/* Lado Direito (Alinhado ao topo) */}
        <div className="flex flex-col sm:items-end gap-2 shrink-0">
          <button
            type="button"
            disabled={tab === "produtos" && categories.length === 0}
            onClick={() =>
              open(
                tab === "categorias"
                  ? { kind: "category", entry: null }
                  : { kind: "product", entry: null },
              )
            }
            className="inline-flex items-center justify-center gap-1.5 px-5 py-2.5 rounded-xl bg-[#610000] hover:bg-[#4a0000] text-white font-semibold text-sm shadow-sm transition-all cursor-pointer disabled:opacity-50"
          >
            <span>{tab === "categorias" ? "+ Nova categoria" : "+ Novo produto"}</span>
          </button>

          <button
            type="button"
            disabled={loading || !!selection}
            onClick={() => setRefresh((value) => value + 1)}
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-200 text-xs font-semibold hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-all cursor-pointer shadow-2xs"
          >
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              className={loading ? "animate-spin" : ""}
            >
              <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
              <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
              <path d="M16 21h5v-5" />
            </svg>
            <span>Atualizar</span>
          </button>
        </div>
      </div>

      {notice && (
        <div
          role="status"
          className="rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 p-4 text-xs sm:text-sm text-emerald-800 dark:text-emerald-300 font-medium leading-relaxed"
        >
          {notice}
        </div>
      )}

      {/* Conteúdo do catálogo */}
      {loading ? (
        <div role="status" className="p-8 text-center text-sm font-medium text-zinc-500">
          Carregando catálogo…
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center">
          <p role="alert" className="text-sm font-semibold text-red-800">
            {error}
          </p>
          <button
            type="button"
            className="mt-3 px-4 py-2 rounded-xl bg-white border border-red-200 text-xs font-semibold text-red-700 hover:bg-red-50"
            onClick={() => setRefresh((value) => value + 1)}
          >
            Tentar novamente
          </button>
        </div>
      ) : (
        <>
          {/* 3. BARRA DE BUSCA E FILTRO (LADO A LADO NA MESMA LINHA) */}
          <div className="flex flex-col sm:flex-row gap-4 items-center">
            {/* Esquerda: Input com ícone de lupa */}
            <div className="relative flex-1 w-full">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-zinc-400">
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <circle cx="11" cy="11" r="8" />
                  <path d="m21 21-4.3-4.3" />
                </svg>
              </span>
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={tab === "categorias" ? "Buscar categoria..." : "Buscar produto..."}
                className="w-full min-h-11 pl-10 pr-4 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white placeholder-zinc-400 text-sm focus:outline-none focus:ring-2 focus:ring-[#610000]/20 focus:border-[#610000] transition-all shadow-2xs"
              />
            </div>

            {/* Direita: Select Todas as categorias (apenas quando visualizando produtos/todos) */}
            {tab !== "categorias" && (
              <div className="w-full sm:w-64">
                <select
                  value={categoryFilter}
                  onChange={(event) => setCategoryFilter(event.target.value)}
                  className="w-full min-h-11 px-3.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#610000]/20 focus:border-[#610000] transition-all shadow-2xs cursor-pointer"
                >
                  <option value="all">Todas as categorias</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                      {category.active ? "" : " — oculta"}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* 4. GRID DE PRODUTOS OU CATEGORIAS */}
          {tab === "categorias" ? (
            /* VISUALIZAÇÃO DE CATEGORIAS MINIMALISTA (ESTILO AVATAR CIRCULAR) */
            <>
              {filteredCategories.length === 0 ? (
                <div role="status" className="p-8 text-center text-sm font-medium text-zinc-500 rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-800 w-full">
                  Nenhuma categoria encontrada.
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-8 lg:gap-10 py-4">
                  {filteredCategories.map((category) => {
                    const categoryProducts = (catalog?.products ?? []).filter(
                      (prod) => prod.category_id === category.id,
                    );
                    const count = categoryProducts.length;
                    const firstProductWithImage = categoryProducts.find(
                      (p) => p.images && p.images.length > 0,
                    );
                    const cover =
                      firstProductWithImage?.images.find(
                        (i) => i.id === firstProductWithImage.cover_image_id,
                      ) || firstProductWithImage?.images[0];
                    let storedCustomImage =
                      typeof window !== "undefined"
                        ? localStorage.getItem(`elozi_cat_img_${restaurantId}_${category.id}`) ||
                          localStorage.getItem(`elozi_cat_img_${category.id}`)
                        : null;
                    // Ignora URLs temporárias revogadas ou strings inválidas
                    if (
                      !storedCustomImage ||
                      storedCustomImage.startsWith("blob:") ||
                      storedCustomImage === "undefined" ||
                      storedCustomImage === "null" ||
                      !storedCustomImage.trim()
                    ) {
                      storedCustomImage = null;
                    }
                    const categoryImageUrl =
                      storedCustomImage || (category as any).image_url || cover?.url;

                    return (
                      <div
                        key={category.id}
                        className="flex flex-col items-center text-center group select-none"
                      >
                        {/* Topo (Nome da Categoria) */}
                        <span
                          className="font-bold text-sm lg:text-base text-zinc-900 dark:text-white mb-2 max-w-[130px] truncate"
                          title={category.name}
                        >
                          {category.name}
                        </span>

                        {/* Centro (Imagem em Círculo + Botão Lápis Lateral) */}
                        <div className="relative inline-block">
                          <button
                            type="button"
                            onClick={() =>
                              open({ kind: "category", entry: category })
                            }
                            aria-label={`Editar categoria ${category.name}`}
                            className="w-24 h-24 lg:w-28 lg:h-28 rounded-full overflow-hidden border-2 border-[#610000]/15 group-hover:border-[#610000] shadow-md transition-all bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#610000]/30"
                          >
                            {categoryImageUrl ? (
                              <>
                                <img
                                  src={categoryImageUrl}
                                  alt={category.name}
                                  loading="lazy"
                                  onError={(e) => {
                                    e.currentTarget.style.display = "none";
                                    const parent = e.currentTarget.parentElement;
                                    const fallback = parent?.querySelector(".category-fallback-icon") as HTMLElement | null;
                                    if (fallback) {
                                      fallback.style.display = "flex";
                                      fallback.classList.remove("hidden");
                                    }
                                  }}
                                  className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                                />
                                <div
                                  style={{ display: "none" }}
                                  className="category-fallback-icon flex-col items-center justify-center text-[#610000]/50 dark:text-red-400/50"
                                >
                                  <svg
                                    className="w-8 h-8 lg:w-9 lg:h-9"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="1.75"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    aria-hidden="true"
                                  >
                                    <path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2" />
                                    <path d="M7 2v20" />
                                    <path d="M21 15V2v0a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7" />
                                  </svg>
                                </div>
                              </>
                            ) : (
                              <div className="flex flex-col items-center justify-center text-[#610000]/50 dark:text-red-400/50">
                                <svg
                                  className="w-8 h-8 lg:w-9 lg:h-9"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="1.75"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  aria-hidden="true"
                                >
                                  <path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2" />
                                  <path d="M7 2v20" />
                                  <path d="M21 15V2v0a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7" />
                                </svg>
                              </div>
                            )}
                          </button>

                          {/* Botão de Lápis (Editar) */}
                          <button
                            type="button"
                            onClick={() =>
                              open({ kind: "category", entry: category })
                            }
                            title="Editar categoria"
                            aria-label={`Editar categoria ${category.name}`}
                            className="absolute bottom-0 -right-1 w-8 h-8 rounded-full bg-[#610000] hover:bg-[#4a0000] text-white shadow-md flex items-center justify-center border-2 border-white dark:border-zinc-900 transition-transform hover:scale-105 cursor-pointer"
                          >
                            <svg
                              className="w-3.5 h-3.5"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              aria-hidden="true"
                            >
                              <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                            </svg>
                          </button>
                        </div>

                        {/* Base (Quantidade de Produtos) */}
                        <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mt-2">
                          {count} {count === 1 ? "produto" : "produtos"}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          ) : (
            /* VISUALIZAÇÃO DE PRODUTOS (4 Colunas no Desktop) */
            <>
              {products.length === 0 && (
                <div role="status" className="p-8 text-center text-sm font-medium text-zinc-500 rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-800">
                  Nenhum produto encontrado.
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                {products.map((product) => {
                  const cover =
                    product.images.find((i) => i.id === product.cover_image_id) ||
                    product.images[0];
                  const categoryName =
                    categoryMap.get(product.category_id)?.name || "Sem categoria";

                  return (
                    <div
                      key={product.id}
                      className="rounded-2xl border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden shadow-xs hover:shadow-md transition-shadow flex flex-col justify-between"
                    >
                      {/* Imagem no Topo com Badge da Categoria sobreposta */}
                      <div className="relative aspect-[16/10] w-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
                        {cover ? (
                          <img
                            src={cover.url}
                            alt={cover.alt || product.name}
                            loading="lazy"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex flex-col items-center justify-center text-zinc-400 dark:text-zinc-500 gap-1">
                            <svg
                              width="26"
                              height="26"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              aria-hidden="true"
                            >
                              <rect width="18" height="18" x="3" y="3" rx="2" />
                              <circle cx="8.5" cy="8.5" r="1.5" />
                              <path d="m21 15-5-5L5 21" />
                            </svg>
                            <span className="text-[10px] font-medium">Sem imagem</span>
                          </div>
                        )}

                        {/* Badge da Categoria no canto superior esquerdo */}
                        <span className="absolute top-2.5 left-2.5 bg-[#610000]/90 backdrop-blur-xs text-white text-[11px] font-semibold px-2.5 py-0.5 rounded-full shadow-xs truncate max-w-[85%]">
                          {categoryName}
                        </span>
                      </div>

                      {/* Corpo do Card (p-4) */}
                      <div className="p-4 flex-1 flex flex-col justify-between">
                        <div>
                          <h3
                            className="font-bold text-base text-zinc-900 dark:text-white line-clamp-1"
                            title={product.name}
                          >
                            {product.name}
                          </h3>

                          {/* Preço em destaque */}
                          <p className="font-extrabold text-[#610000] dark:text-red-400 text-sm mt-0.5">
                            {money.format(product.price_in_cents / 100)}
                          </p>

                          {/* Badge de Status e Badges Secundários */}
                          <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
                            {product.available ? (
                              <span className="bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 text-[11px] font-semibold px-2.5 py-0.5 rounded-full inline-flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                Disponível
                              </span>
                            ) : (
                              <span className="bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 text-[11px] font-semibold px-2.5 py-0.5 rounded-full inline-flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                                Indisponível
                              </span>
                            )}

                            {product.featured && (
                              <span className="bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 text-[10px] font-semibold px-2 py-0.5 rounded-full">
                                Destaque
                              </span>
                            )}

                            {product.preparation_station && product.preparation_station !== 'none' && (
                              <span className="bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 text-[10px] font-medium px-2 py-0.5 rounded-full">
                                {product.preparation_station === 'bar' ? 'Bar' : 'Cozinha'}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Rodapé de Ações do Card */}
                        <div className="mt-4 pt-3 border-t border-zinc-100 dark:border-zinc-800/80 flex items-center justify-between gap-2">
                          <button
                            type="button"
                            onClick={() => open({ kind: "product", entry: product })}
                            className="bg-[#610000] hover:bg-[#4a0000] text-white text-xs font-semibold px-4 py-2 rounded-xl flex-1 flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
                          >
                            <svg
                              width="13"
                              height="13"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              aria-hidden="true"
                            >
                              <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                              <path d="m15 5 4 4" />
                            </svg>
                            <span>Editar</span>
                          </button>

                          <ProductActionsDropdown
                            product={product}
                            onEdit={() => open({ kind: "product", entry: product })}
                            onToggleAvailability={() => void toggleAvailability(product)}
                            onToggleFeatured={() => void toggleFeatured(product)}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
