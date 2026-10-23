import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { supabase } from "../../lib/supabase";
import { priceToCents, saveCatalogEntry, slugify } from "./adminCatalog";
import type { AdminCategory, AdminProduct } from "./adminCatalog";
import { MAX_PHOTOS, preparePhoto, prepareVideo, uploadMenuMedia } from "./menuMedia";
import type { DraftPhoto, DraftVideo } from "./menuMedia";
import { fetchInventory } from "../inventory/inventoryService";
import type { InventoryItem } from "../inventory/inventoryService";

export type CatalogSelection =
  | { kind: "category"; entry: AdminCategory | null }
  | { kind: "product"; entry: AdminProduct | null };

function Switch({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-[#610000] focus:ring-offset-2 ${
        checked ? "bg-emerald-600" : "bg-zinc-300 dark:bg-zinc-700"
      } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
    >
      <span
        aria-hidden="true"
        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
          checked ? "translate-x-5" : "translate-x-0"
        }`}
      />
    </button>
  );
}

export function CatalogEditor({
  selection,
  categories,
  restaurantSlug,
  restaurantId,
  onSaved,
  onCancel,
}: {
  selection: CatalogSelection;
  categories: AdminCategory[];
  restaurantSlug: string;
  restaurantId: string;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const entry = selection.entry;
  const product = selection.kind === "product" ? selection.entry : null;
  const category = selection.kind === "category" ? selection.entry : null;
  const isProduct = selection.kind === "product";

  const [id] = useState(() => entry?.id ?? crypto.randomUUID());
  const [draft, setDraft] = useState({
    name: entry?.name ?? "",
    slug: entry?.slug ?? "",
    order: String(entry?.sort_order ?? 0),
    active: category?.active ?? true,
    categoryId:
      product?.category_id ??
      categories.find((item) => item.active)?.id ??
      categories[0]?.id ??
      "",
    shortDescription: product?.short_description ?? "",
    description: product?.description ?? "",
    price: product
      ? (product.price_in_cents / 100).toFixed(2).replace(".", ",")
      : "",
    promoPrice: "",
    serviceType: "À la carte",
    available: product?.available ?? true,
    featured: product?.featured ?? false,
    dietaryInformation: product?.dietary_information ?? "",
    prepTimeMin:
      product?.prep_time_min_minutes != null
        ? String(product.prep_time_min_minutes)
        : "",
    prepTimeMax:
      product?.prep_time_max_minutes != null
        ? String(product.prep_time_max_minutes)
        : "",
    preparationStation:
      (product?.preparation_station as "kitchen" | "bar" | "none") ?? "kitchen",
    inventoryItemId: product?.inventory_item_id ?? "",
  });

  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [activeSection, setActiveSection] = useState<
    "basic" | "media" | "price" | "availability" | "details"
  >("basic");

  useEffect(() => {
    if (isProduct && restaurantId) {
      fetchInventory(restaurantId)
        .then(setInventoryItems)
        .catch((err) =>
          console.error("Erro ao carregar estoque para vinculo:", err),
        );
    }
  }, [isProduct, restaurantId]);

  const [photos, setPhotos] = useState<DraftPhoto[]>(() =>
    [...(product?.images ?? [])].sort((a, b) => a.sortOrder - b.sortOrder),
  );
  const [video, setVideo] = useState<DraftVideo | null>(
    product?.video ?? null,
  );
  const [coverId, setCoverId] = useState(
    product?.cover_image_id ?? product?.images[0]?.id ?? "",
  );

  const [preparing, setPreparing] = useState(false);
  const [progress, setProgress] = useState("");
  const uploadCache = useRef(new Map<string, string>());
  const previews = useRef({ photos, video });
  previews.current = { photos, video };

  const [dirty, setDirty] = useState(false);
  const [slugEdited, setSlugEdited] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submitting = useRef(false);
  const mounted = useRef(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const categoryFileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Imagem personalizada da categoria
  const [categoryImageUrl, setCategoryImageUrl] = useState<string>(() => {
    if (typeof window !== "undefined" && entry?.id) {
      return (
        localStorage.getItem(`elozi_cat_img_${restaurantId}_${entry.id}`) ||
        localStorage.getItem(`elozi_cat_img_${entry.id}`) ||
        (category as any)?.image_url ||
        ""
      );
    }
    return "";
  });
  const [categoryImageFile, setCategoryImageFile] = useState<Blob | null>(null);
  const [categoryImagePreview, setCategoryImagePreview] = useState<string>("");

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      previews.current.photos.forEach(
        (photo) => photo.previewUrl && URL.revokeObjectURL(photo.previewUrl),
      );
      if (previews.current.video?.previewUrl)
        URL.revokeObjectURL(previews.current.video.previewUrl);
      if (categoryImagePreview) URL.revokeObjectURL(categoryImagePreview);
    };
  }, [categoryImagePreview]);

  useEffect(() => {
    if (!dirty) return;
    function beforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [dirty]);

  function cancel() {
    if (busy || preparing) return;
    if (!dirty || window.confirm("Descartar as alterações deste formulário?")) {
      onCancel();
    }
  }

  async function handlePhotoFiles(files: FileList | File[]) {
    const fileArray = Array.from(files);
    if (!fileArray.length || busy || preparing) return;
    setError("");
    if (photos.length + fileArray.length > MAX_PHOTOS) {
      setError(`Use no máximo ${MAX_PHOTOS} fotos por produto.`);
      return;
    }
    setPreparing(true);
    try {
      const prepared: DraftPhoto[] = [];
      for (const file of fileArray) {
        prepared.push(
          await preparePhoto(
            file,
            `Foto de ${draft.name.trim() || "produto"}`,
          ),
        );
      }
      const newPhotos = [...photos, ...prepared];
      setPhotos(newPhotos);
      if (!coverId && newPhotos.length > 0) {
        setCoverId(newPhotos[0].id);
      }
      setDirty(true);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível preparar as fotos.",
      );
    } finally {
      setPreparing(false);
    }
  }

  function removePhoto(photoId: string) {
    const photo = photos.find((p) => p.id === photoId);
    if (photo?.previewUrl) URL.revokeObjectURL(photo.previewUrl);
    const remaining = photos.filter((p) => p.id !== photoId);
    setPhotos(remaining);
    if (coverId === photoId) {
      setCoverId(remaining[0]?.id || "");
    }
    setDirty(true);
  }

  async function handleVideoFile(file: File) {
    if (busy || preparing) return;
    setPreparing(true);
    setError("");
    try {
      const prepared = await prepareVideo(file);
      if (video?.previewUrl) URL.revokeObjectURL(video.previewUrl);
      setVideo(prepared);
      setDirty(true);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível preparar o vídeo.",
      );
    } finally {
      setPreparing(false);
    }
  }

  function removeVideo() {
    if (video?.previewUrl) URL.revokeObjectURL(video.previewUrl);
    setVideo(null);
    setDirty(true);
  }

  async function handleCategoryImage(file: File) {
    if (busy || preparing) return;
    setError("");
    setPreparing(true);
    try {
      const prepared = await preparePhoto(
        file,
        `Foto da categoria ${draft.name.trim() || "categoria"}`
      );
      if (categoryImagePreview) URL.revokeObjectURL(categoryImagePreview);
      setCategoryImageFile(prepared.file || null);
      setCategoryImagePreview(prepared.previewUrl || "");
      setDirty(true);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível preparar a foto da categoria."
      );
    } finally {
      setPreparing(false);
    }
  }

  function removeCategoryImage() {
    if (categoryImagePreview) URL.revokeObjectURL(categoryImagePreview);
    setCategoryImageFile(null);
    setCategoryImagePreview("");
    setCategoryImageUrl("");
    setDirty(true);
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      void handlePhotoFiles(e.dataTransfer.files);
    }
  };

  const scrollTo = (
    id: string,
    sec: "basic" | "media" | "price" | "availability" | "details",
  ) => {
    setActiveSection(sec);
    document.getElementById(id)?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || preparing) return;
    setError("");
    if (!draft.name.trim()) {
      setError("Informe o nome do produto.");
      return;
    }
    if (!/^\d{1,4}$/.test(draft.order)) {
      setError("Informe uma ordem entre 0 e 9999.");
      return;
    }
    if (isProduct && video && photos.length === 0) {
      setError("Adicione uma foto de capa para o vídeo do Explorar.");
      return;
    }
    if (photos.some((photo) => !photo.alt.trim())) {
      setError("Descreva cada foto do produto.");
      return;
    }

    let prepMin: number | null = null;
    let prepMax: number | null = null;
    if (isProduct) {
      const minTrim = draft.prepTimeMin.trim();
      const maxTrim = draft.prepTimeMax.trim();
      if ((minTrim && !maxTrim) || (!minTrim && maxTrim)) {
        setError(
          "Informe tanto o tempo mínimo quanto o máximo ou deixe ambos em branco.",
        );
        return;
      }
      if (minTrim && maxTrim) {
        const parsedMin = parseInt(minTrim, 10);
        const parsedMax = parseInt(maxTrim, 10);
        if (
          isNaN(parsedMin) ||
          isNaN(parsedMax) ||
          parsedMin < 1 ||
          parsedMax < 1 ||
          parsedMin > 1440 ||
          parsedMax > 1440
        ) {
          setError(
            "O tempo estimado de preparo deve estar entre 1 e 1440 minutos.",
          );
          return;
        }
        if (parsedMin > parsedMax) {
          setError(
            "O tempo mínimo de preparo não pode ser maior que o tempo máximo.",
          );
          return;
        }
        prepMin = parsedMin;
        prepMax = parsedMax;
      }
    }

    submitting.current = true;
    setBusy(true);
    try {
      const values: Record<string, unknown> = {
        name: draft.name.trim(),
        slug: draft.slug,
        sort_order: Number(draft.order),
        ...(isProduct
          ? {
              category_id: draft.categoryId,
              short_description:
                draft.shortDescription.trim() ||
                draft.description.trim().slice(0, 240),
              description: draft.description.trim(),
              price_in_cents: priceToCents(draft.price),
              available: draft.available,
              featured: draft.featured,
              dietary_information: draft.dietaryInformation.trim(),
              prep_time_min_minutes: prepMin,
              prep_time_max_minutes: prepMax,
              preparation_station: draft.preparationStation,
              inventory_item_id: draft.inventoryItemId.trim()
                ? draft.inventoryItemId.trim()
                : null,
            }
          : { active: draft.active }),
      };

      if (isProduct) {
        const media = await uploadMenuMedia(
          photos,
          video,
          restaurantId,
          id,
          uploadCache.current,
          (message) => {
            if (mounted.current) setProgress(message);
          },
        );
        Object.assign(values, media, { cover_image_id: coverId || null });
      } else {
        // Upload da foto personalizada da categoria
        if (categoryImageFile) {
          if (mounted.current) setProgress("Enviando foto da categoria…");
          try {
            const path = `${restaurantId}/categories/${id}/${crypto.randomUUID()}.webp`;
            const bucket = supabase.storage.from("menu-images");
            const { error: upErr } = await bucket.upload(path, categoryImageFile, {
              contentType: "image/webp",
              cacheControl: "31536000",
              upsert: true,
            });
            if (!upErr) {
              const publicUrl = bucket.getPublicUrl(path).data.publicUrl;
              localStorage.setItem(`elozi_cat_img_${restaurantId}_${id}`, publicUrl);
              localStorage.setItem(`elozi_cat_img_${id}`, publicUrl);
            } else if (categoryImagePreview) {
              localStorage.setItem(`elozi_cat_img_${restaurantId}_${id}`, categoryImagePreview);
              localStorage.setItem(`elozi_cat_img_${id}`, categoryImagePreview);
            }
          } catch (imgErr) {
            console.error("Erro ao salvar foto da categoria:", imgErr);
          }
        } else if (!categoryImageUrl && !categoryImagePreview) {
          localStorage.removeItem(`elozi_cat_img_${restaurantId}_${id}`);
          localStorage.removeItem(`elozi_cat_img_${id}`);
        }
      }

      if (mounted.current) setProgress("Salvando no catálogo…");
      await saveCatalogEntry(
        restaurantSlug,
        selection.kind,
        id,
        entry?.revision ?? 0,
        values,
      );
      if (mounted.current) {
        setDirty(false);
        onSaved();
      }
    } catch (cause) {
      if (mounted.current)
        setError(
          cause instanceof Error ? cause.message : "Não foi possível salvar.",
        );
    } finally {
      submitting.current = false;
      if (mounted.current) {
        setBusy(false);
        setProgress("");
      }
    }
  }

  const [copiedSlug, setCopiedSlug] = useState(false);

  function copySlugToClipboard() {
    if (draft.slug) {
      void navigator.clipboard.writeText(draft.slug);
      setCopiedSlug(true);
      setTimeout(() => setCopiedSlug(false), 2000);
    }
  }

  // Cover photo preview
  const currentCover =
    photos.find((p) => p.id === coverId) || photos[0];
  const selectedCategoryName =
    categories.find((c) => c.id === draft.categoryId)?.name || "Prato principal";

  // SE FOR EDIÇÃO DE CATEGORIA: RENDERIZA FORMULÁRIO LIMPO DE CATEGORIA
  if (!isProduct) {
    const activePhoto = categoryImagePreview || categoryImageUrl;

    return (
      <section className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200/80 dark:border-zinc-800 p-6 sm:p-8 max-w-xl mx-auto shadow-sm">
        {/* Hidden input para upload da foto da categoria */}
        <input
          ref={categoryFileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleCategoryImage(file);
            e.target.value = "";
          }}
        />

        <div className="flex flex-col items-center text-center mb-6">
          {/* Círculo Avatar Interativo da Categoria */}
          <div className="relative mb-3 group">
            <button
              type="button"
              onClick={() => categoryFileInputRef.current?.click()}
              title="Clique para escolher a imagem da categoria"
              aria-label="Escolher foto da categoria"
              className="w-28 h-28 rounded-full overflow-hidden border-2 border-[#610000]/25 hover:border-[#610000] shadow-md bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center cursor-pointer transition-all relative focus:outline-none focus:ring-2 focus:ring-[#610000]/30"
            >
              {activePhoto ? (
                <img
                  src={activePhoto}
                  alt={draft.name || "Categoria"}
                  className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                />
              ) : (
                <div className="flex flex-col items-center justify-center text-[#610000]/60 dark:text-red-400/60">
                  <svg
                    className="w-9 h-9"
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

              {/* Overlay suave ao passar o mouse */}
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white text-[10px] font-semibold">
                <svg
                  className="w-5 h-5 mb-0.5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
                  <circle cx="12" cy="13" r="3" />
                </svg>
                <span>{activePhoto ? "Alterar foto" : "Adicionar foto"}</span>
              </div>
            </button>

            {/* Botão de Lápis (Editar) Ativo */}
            <button
              type="button"
              onClick={() => categoryFileInputRef.current?.click()}
              title="Alterar foto da categoria"
              aria-label="Alterar foto"
              className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-[#610000] hover:bg-[#4a0000] text-white flex items-center justify-center shadow-md border-2 border-white dark:border-zinc-900 transition-transform hover:scale-110 cursor-pointer"
            >
              <svg
                className="w-3.5 h-3.5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
              </svg>
            </button>
          </div>

          <h2 className="text-xl font-bold text-zinc-900 dark:text-white">
            {entry ? "Editar categoria" : "Nova categoria"}
          </h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 max-w-sm">
            Clique no círculo ou no lápis para escolher uma foto para esta categoria.
          </p>

          {activePhoto && (
            <button
              type="button"
              onClick={removeCategoryImage}
              className="mt-2 text-xs text-red-600 dark:text-red-400 hover:underline cursor-pointer"
            >
              Remover foto personalizada
            </button>
          )}
        </div>

        <form onSubmit={(e) => void submit(e)} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-zinc-800 dark:text-zinc-200 mb-1">
              Nome da categoria *
            </label>
            <input
              required
              maxLength={100}
              value={draft.name}
              onChange={(e) => {
                const name = e.target.value;
                setDraft((curr) => ({
                  ...curr,
                  name,
                  slug: !entry && !slugEdited ? slugify(name) : curr.slug,
                }));
              }}
              className="w-full min-h-11 px-3.5 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#610000]/20 focus:border-[#610000]"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-zinc-800 dark:text-zinc-200 mb-1">
              Identificador (URL) *
            </label>
            <input
              required
              maxLength={120}
              readOnly={!!entry}
              value={draft.slug}
              onChange={(e) => {
                setSlugEdited(true);
                setDraft({ ...draft, slug: e.target.value });
              }}
              className="w-full min-h-11 px-3.5 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/60 text-sm text-zinc-900 dark:text-white"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-zinc-800 dark:text-zinc-200 mb-1">
              Ordem de exibição *
            </label>
            <input
              type="number"
              min={0}
              max={9999}
              value={draft.order}
              onChange={(e) => setDraft({ ...draft, order: e.target.value })}
              className="w-full min-h-11 px-3.5 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm text-zinc-900 dark:text-white"
            />
          </div>

          <div className="flex items-center gap-3 pt-2">
            <Switch
              checked={draft.active}
              onChange={(checked) => setDraft({ ...draft, active: checked })}
            />
            <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
              Categoria visível no cardápio
            </span>
          </div>

          {error && (
            <p className="rounded-xl bg-red-50 p-3 text-xs text-red-800 font-semibold">
              {error}
            </p>
          )}

          <div className="flex items-center gap-3 pt-4 border-t border-zinc-100 dark:border-zinc-800">
            <button
              type="submit"
              disabled={busy}
              className="px-5 py-2.5 rounded-xl bg-[#610000] hover:bg-[#4a0000] text-white text-xs font-bold transition-all shadow-sm cursor-pointer"
            >
              {busy ? "Salvando…" : "Salvar alterações"}
            </button>
            <button
              type="button"
              onClick={cancel}
              className="px-4 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs font-semibold text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 transition-colors cursor-pointer"
            >
              Cancelar
            </button>
          </div>
        </form>
      </section>
    );
  }

  // SE FOR EDIÇÃO / CRIAÇÃO DE PRODUTO: NOVA VIEW REESTRUTURADA FIEL À IMAGEM
  return (
    <div className="space-y-6">
      {/* Hidden file inputs for photo and video */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files) void handlePhotoFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <input
        ref={videoInputRef}
        type="file"
        accept="video/mp4,video/webm"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleVideoFile(file);
          e.target.value = "";
        }}
      />

      {/* A. CABEÇALHO DA VIEW DE EDIÇÃO */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <button
            type="button"
            onClick={cancel}
            className="text-xs font-medium text-[#8C3A27] dark:text-red-400 hover:underline inline-flex items-center gap-1 mb-1 cursor-pointer"
          >
            <span>&lt; Voltar para o cardápio</span>
          </button>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-white tracking-tight">
            {entry ? "Editar produto" : "Novo produto"}
          </h1>
          <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">
            Atualize as informações do seu produto, imagens, preço e demais detalhes.
          </p>
        </div>

        {/* Botões de Ação Fixos no Topo */}
        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={cancel}
            disabled={busy || preparing}
            className="px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200 text-xs font-medium hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors cursor-pointer disabled:opacity-50 shadow-2xs"
          >
            Cancelar
          </button>
          <button
            type="submit"
            form="product-editor-form"
            disabled={busy || preparing}
            className="px-4 py-2 rounded-lg bg-[#610000] hover:bg-[#4a0000] text-white text-xs font-medium shadow-sm flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
              <polyline points="17 21 17 13 7 13 7 21" />
              <polyline points="7 3 7 8 15 8" />
            </svg>
            <span>{busy ? "Salvando…" : preparing ? "Preparando…" : "Salvar alterações"}</span>
          </button>
        </div>
      </div>

      {/* B. BARRA DE NAVEGAÇÃO DE SEÇÕES (TABS HORIZONTAIS) */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
        {[
          {
            id: "sec-basic",
            key: "basic",
            label: "Informações básicas",
            icon: (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect width="18" height="18" x="3" y="3" rx="2" />
                <path d="M3 9h18" />
                <path d="M9 21V9" />
              </svg>
            ),
          },
          {
            id: "sec-media",
            key: "media",
            label: "Fotos e vídeo",
            icon: (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
                <circle cx="9" cy="9" r="2" />
                <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
              </svg>
            ),
          },
          {
            id: "sec-price",
            key: "price",
            label: "Preço",
            icon: (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
                <line x1="7" y1="7" x2="7.01" y2="7" />
              </svg>
            ),
          },
          {
            id: "sec-availability",
            key: "availability",
            label: "Disponibilidade",
            icon: (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 14 14" />
              </svg>
            ),
          },
          {
            id: "sec-details",
            key: "details",
            label: "Detalhes adicionais",
            icon: (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            ),
          },
        ].map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => scrollTo(item.id, item.key as any)}
            className={`px-3.5 py-1.5 text-xs whitespace-nowrap transition-all rounded-xl flex items-center gap-2 cursor-pointer ${
              activeSection === item.key
                ? "border border-[#F0D8D0] dark:border-zinc-700 bg-[#FDF6F3] dark:bg-zinc-800 text-[#8C3A27] dark:text-red-400 font-semibold shadow-2xs"
                : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
            }`}
          >
            <span className={activeSection === item.key ? "text-[#8C3A27] dark:text-red-400" : "text-zinc-400"}>
              {item.icon}
            </span>
            <span>{item.label}</span>
          </button>
        ))}
      </div>

      {/* Status Messages */}
      {busy && progress && (
        <div role="status" className="p-3 bg-blue-50 text-blue-800 rounded-xl text-xs font-semibold">
          {progress}
        </div>
      )}
      {error && (
        <div role="alert" className="p-3 bg-red-50 text-red-800 rounded-xl text-xs font-semibold">
          {error}
        </div>
      )}

      {/* FORMULÁRIO PRINCIPAL */}
      <form
        id="product-editor-form"
        onSubmit={(e) => void submit(e)}
        onChange={() => setDirty(true)}
      >
        {/* C. GRID PRINCIPAL EM 2 COLUNAS ASSIMÉTRICAS (8 + 4) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* ==================== COLUNA DA ESQUERDA (8 Colunas) ==================== */}
          <div className="lg:col-span-8 flex flex-col gap-6">
            {/* Card 1: Informações básicas */}
            <div
              id="sec-basic"
              className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200/80 dark:border-zinc-800 p-6 shadow-2xs space-y-4"
            >
              <div className="flex items-center gap-2.5">
                <span className="text-[#8C3A27] dark:text-red-400">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect width="18" height="18" x="3" y="3" rx="2" />
                    <path d="M3 9h18" />
                    <path d="M9 21V9" />
                  </svg>
                </span>
                <div>
                  <h2 className="text-sm font-bold text-zinc-900 dark:text-white">
                    Informações básicas
                  </h2>
                  <p className="text-xs text-zinc-400 dark:text-zinc-500 font-normal">
                    Essas informações são essenciais para o seu produto.
                  </p>
                </div>
              </div>

              {/* Nome do produto */}
              <div>
                <label className="block text-xs font-semibold text-zinc-800 dark:text-zinc-200 mb-1.5">
                  Nome do produto *
                </label>
                <input
                  required
                  maxLength={100}
                  value={draft.name}
                  placeholder="Ex: Risoto de cogumelos"
                  onChange={(e) => {
                    const name = e.target.value;
                    setDraft((curr) => ({
                      ...curr,
                      name,
                      slug: !entry && !slugEdited ? slugify(name) : curr.slug,
                    }));
                  }}
                  className="w-full rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3.5 py-2.5 text-sm text-zinc-900 dark:text-white placeholder-zinc-400 focus:outline-none focus:border-zinc-400 transition-all"
                />
                <div className="text-right text-[11px] text-zinc-400 mt-1">
                  {draft.name.length}/100
                </div>
              </div>

              {/* Linha com 2 Colunas: Identificador e Categoria */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-zinc-800 dark:text-zinc-200 mb-1.5">
                    Identificador no endereço *
                  </label>
                  <div className="relative">
                    <input
                      required
                      pattern="[a-z0-9]+(-[a-z0-9]+)*"
                      maxLength={100}
                      value={draft.slug}
                      onChange={(e) => {
                        setSlugEdited(true);
                        setDraft({ ...draft, slug: e.target.value });
                      }}
                      className="w-full rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3.5 py-2.5 pr-10 text-sm text-zinc-900 dark:text-white placeholder-zinc-400 focus:outline-none focus:border-zinc-400 transition-all"
                    />
                    <button
                      type="button"
                      title={copiedSlug ? "Copiado!" : "Copiar identificador"}
                      onClick={copySlugToClipboard}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 transition-colors p-1 cursor-pointer"
                    >
                      {copiedSlug ? (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      ) : (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
                          <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
                        </svg>
                      )}
                    </button>
                  </div>
                  <div className="text-right text-[11px] text-zinc-400 mt-1">
                    {draft.slug.length}/100
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-800 dark:text-zinc-200 mb-1.5">
                    Categoria *
                  </label>
                  <select
                    required
                    value={draft.categoryId}
                    onChange={(e) => setDraft({ ...draft, categoryId: e.target.value })}
                    className="w-full rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3.5 py-2.5 text-sm text-zinc-900 dark:text-white focus:outline-none focus:border-zinc-400 transition-all cursor-pointer"
                  >
                    <option value="" disabled>Selecione uma categoria</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} {c.active ? "" : " (oculta)"}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Alerta de Endereço Preservado */}
              <div className="flex items-center gap-2.5 p-3 rounded-xl bg-[#FAF7F2] dark:bg-zinc-800/50 border border-[#EFEAE2] dark:border-zinc-700 text-xs text-zinc-600 dark:text-zinc-400">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[#8C3A27] shrink-0">
                  <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                  <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                </svg>
                <span>O endereço é preservado para manter os links existentes.</span>
              </div>
            </div>

            {/* Card 2: Descrição do produto */}
            <div
              id="sec-description"
              className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200/80 dark:border-zinc-800 p-6 shadow-2xs space-y-4"
            >
              <div className="flex items-center gap-2.5">
                <span className="text-[#8C3A27] dark:text-red-400">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="16" y1="13" x2="8" y2="13" />
                    <line x1="16" y1="17" x2="8" y2="17" />
                    <polyline points="10 9 9 9 8 9" />
                  </svg>
                </span>
                <div>
                  <h2 className="text-sm font-bold text-zinc-900 dark:text-white">
                    Descrição do produto
                  </h2>
                  <p className="text-xs text-zinc-400 dark:text-zinc-500 font-normal">
                    Conte um pouco mais sobre o seu produto. Isso ajuda seus clientes a escolherem.
                  </p>
                </div>
              </div>

              <div>
                <textarea
                  rows={4}
                  maxLength={500}
                  value={draft.description}
                  placeholder="Risoto cremoso de cogumelos frescos, finalizado com parmesão e ervas."
                  onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                  className="w-full p-3.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm text-zinc-900 dark:text-white placeholder-zinc-400 focus:outline-none focus:border-zinc-400 transition-all resize-y"
                />
                <div className="text-right text-[11px] text-zinc-400 mt-1">
                  {draft.description.length}/500
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-800 dark:text-zinc-200 mb-1.5">
                  Adicionar observações (opcional)
                </label>
                <input
                  maxLength={200}
                  value={draft.dietaryInformation}
                  placeholder="Ex: alérgicos, ingredientes especiais, etc."
                  onChange={(e) => setDraft({ ...draft, dietaryInformation: e.target.value })}
                  className="w-full rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3.5 py-2.5 text-sm text-zinc-900 dark:text-white placeholder-zinc-400 focus:outline-none focus:border-zinc-400 transition-all"
                />
                <div className="text-right text-[11px] text-zinc-400 mt-1">
                  {draft.dietaryInformation.length}/200
                </div>
              </div>
            </div>

            {/* Linha Dupla: Preço + Disponibilidade */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Card 3A — Preço */}
              <div
                id="sec-price"
                className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200/80 dark:border-zinc-800 p-6 shadow-2xs flex flex-col justify-between space-y-4"
              >
                <div>
                  <div className="flex items-center gap-2.5">
                    <span className="text-[#8C3A27] dark:text-red-400">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
                        <line x1="7" y1="7" x2="7.01" y2="7" />
                      </svg>
                    </span>
                    <div>
                      <h2 className="text-sm font-bold text-zinc-900 dark:text-white">
                        Preço
                      </h2>
                      <p className="text-xs text-zinc-400 dark:text-zinc-500 font-normal">
                        Defina o valor do seu produto.
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 mt-4">
                    <div>
                      <label className="block text-xs font-semibold text-zinc-800 dark:text-zinc-200 mb-1.5">
                        Preço do produto *
                      </label>
                      <input
                        required
                        type="text"
                        inputMode="decimal"
                        value={draft.price}
                        placeholder="R$ 48,00"
                        onChange={(e) => setDraft({ ...draft, price: e.target.value })}
                        className="w-full rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3.5 py-2.5 text-sm font-medium text-zinc-900 dark:text-white focus:outline-none focus:border-zinc-400"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-zinc-800 dark:text-zinc-200 mb-1.5">
                        Preço promocional (opcional)
                      </label>
                      <div className="relative">
                        <input
                          type="text"
                          inputMode="decimal"
                          value={draft.promoPrice}
                          placeholder="R$ 0,00"
                          onChange={(e) => setDraft({ ...draft, promoPrice: e.target.value })}
                          className="w-full rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3.5 py-2.5 pr-9 text-sm text-zinc-900 dark:text-white placeholder-zinc-400 focus:outline-none focus:border-zinc-400"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none">
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect width="18" height="18" x="3" y="4" rx="2" ry="2" />
                            <line x1="16" y1="2" x2="16" y2="6" />
                            <line x1="8" y1="2" x2="8" y2="6" />
                            <line x1="3" y1="10" x2="21" y2="10" />
                          </svg>
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <p className="text-[11px] text-zinc-400 dark:text-zinc-500 leading-tight">
                  O preço promocional aparecerá no cardápio com o valor original riscado.
                </p>
              </div>

              {/* Card 3B — Disponibilidade */}
              <div
                id="sec-availability"
                className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200/80 dark:border-zinc-800 p-6 shadow-2xs flex flex-col justify-between space-y-4"
              >
                <div>
                  <div className="flex items-center gap-2.5">
                    <span className="text-[#8C3A27] dark:text-red-400">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" />
                        <polyline points="12 6 12 12 14 14" />
                      </svg>
                    </span>
                    <div>
                      <h2 className="text-sm font-bold text-zinc-900 dark:text-white">
                        Disponibilidade
                      </h2>
                      <p className="text-xs text-zinc-400 dark:text-zinc-500 font-normal">
                        Defina se o produto está disponível no cardápio.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3.5 mt-5">
                    <Switch
                      checked={draft.available}
                      onChange={(checked) => setDraft({ ...draft, available: checked })}
                    />
                    <div>
                      <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200 block">
                        Produto disponível no cardápio
                      </span>
                      <span className="text-[11px] text-zinc-400 dark:text-zinc-500 block mt-0.5">
                        Desative para que o item não apareça no cardápio.
                      </span>
                    </div>
                  </div>
                </div>

                <div />
              </div>
            </div>

            {/* Card 4: Detalhes adicionais */}
            <div
              id="sec-details"
              className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200/80 dark:border-zinc-800 p-6 shadow-2xs space-y-4"
            >
              <div className="flex items-center gap-2.5">
                <span className="text-[#8C3A27] dark:text-red-400">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="3" />
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                  </svg>
                </span>
                <div>
                  <h2 className="text-sm font-bold text-zinc-900 dark:text-white">
                    Detalhes adicionais
                  </h2>
                  <p className="text-xs text-zinc-400 dark:text-zinc-500 font-normal">
                    Configure informações extras do produto.
                  </p>
                </div>
              </div>

              {/* Grid em 3 Colunas Exatas da Imagem */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-center pt-1">
                <div>
                  <label className="block text-xs font-semibold text-zinc-800 dark:text-zinc-200 mb-1.5">
                    Tipo de serviço
                  </label>
                  <select
                    value={draft.serviceType}
                    onChange={(e) => setDraft({ ...draft, serviceType: e.target.value })}
                    className="w-full rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3.5 py-2.5 text-sm text-zinc-900 dark:text-white cursor-pointer focus:outline-none focus:border-zinc-400"
                  >
                    <option value="A la carte">A la carte</option>
                    <option value="Rodízio">Rodízio</option>
                    <option value="Buffet">Buffet</option>
                    <option value="Self-service">Self-service</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-800 dark:text-zinc-200 mb-1.5">
                    Tempo de preparo (opcional)
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={draft.prepTimeMin ? `${draft.prepTimeMin} min` : ""}
                      placeholder="15 min"
                      onChange={(e) => {
                        const val = e.target.value.replace(/\D/g, "");
                        setDraft({
                          ...draft,
                          prepTimeMin: val,
                          prepTimeMax: val,
                        });
                      }}
                      className="w-full rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3.5 py-2.5 pr-10 text-sm text-zinc-900 dark:text-white placeholder-zinc-400 focus:outline-none focus:border-zinc-400"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" />
                        <polyline points="12 6 12 12 16 14" />
                      </svg>
                    </span>
                  </div>
                </div>

                <div className="pt-4 sm:pt-3">
                  <label className="flex items-start gap-2.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={draft.featured}
                      onChange={(e) => setDraft({ ...draft, featured: e.target.checked })}
                      className="mt-0.5 w-4 h-4 rounded border-zinc-300 text-[#610000] accent-[#610000] focus:ring-[#610000]"
                    />
                    <div>
                      <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 block">
                        Produto em destaque
                      </span>
                      <span className="text-[11px] text-zinc-400 dark:text-zinc-500 block">
                        Aparece em primeiro lugar no cardápio.
                      </span>
                    </div>
                  </label>
                </div>
              </div>

              {/* Seção sutil expansível para opções operacionais KDS e Estoque */}
              <details className="pt-2 text-xs text-zinc-500">
                <summary className="cursor-pointer text-zinc-400 hover:text-zinc-600 font-medium select-none py-1">
                  + Opções operacionais de preparo e estoque
                </summary>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3 border-t border-zinc-100 dark:border-zinc-800 mt-2">
                  <div>
                    <label className="block text-xs font-semibold text-zinc-800 dark:text-zinc-200 mb-1.5">
                      Estação de preparo (KDS)
                    </label>
                    <select
                      value={draft.preparationStation}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          preparationStation: e.target.value as "kitchen" | "bar" | "none",
                        })
                      }
                      className="w-full rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3.5 py-2.5 text-sm text-zinc-900 dark:text-white cursor-pointer"
                    >
                      <option value="kitchen">Cozinha (Padrão)</option>
                      <option value="bar">Bar (Bebidas e Drinks)</option>
                      <option value="none">Sem preparo / Pronta entrega</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-zinc-800 dark:text-zinc-200 mb-1.5">
                      Vincular ao estoque
                    </label>
                    <select
                      value={draft.inventoryItemId}
                      onChange={(e) => setDraft({ ...draft, inventoryItemId: e.target.value })}
                      className="w-full rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3.5 py-2.5 text-sm text-zinc-900 dark:text-white cursor-pointer"
                    >
                      <option value="">Sem vínculo (Estoque ilimitado)</option>
                      {inventoryItems.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name} ({item.unit_measure}) — Saldo: {item.current_quantity}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </details>
            </div>
          </div>

          {/* ==================== COLUNA DA DIREITA (4 Colunas) ==================== */}
          <div className="lg:col-span-4 flex flex-col gap-6">
            {/* Card Lateral 1: Prévia no cardápio */}
            <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200/80 dark:border-zinc-800 p-6 shadow-2xs space-y-4">
              <div className="flex items-center gap-2.5">
                <span className="text-[#8C3A27] dark:text-red-400">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
                    <circle cx="9" cy="9" r="2" />
                    <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
                  </svg>
                </span>
                <h3 className="text-sm font-bold text-zinc-900 dark:text-white">
                  Prévia no cardápio
                </h3>
              </div>

              {/* Card visual de simulação do cardápio */}
              <div className="space-y-3">
                <div className="relative aspect-[16/10] w-full rounded-2xl overflow-hidden bg-zinc-100 dark:bg-zinc-800">
                  {currentCover ? (
                    <img
                      src={currentCover.previewUrl || currentCover.url}
                      alt={currentCover.alt || draft.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <img
                      src="https://images.unsplash.com/photo-1633964913295-ceb43826e7c9?auto=format&fit=crop&w=800&q=80"
                      alt="Risoto de cogumelos"
                      className="w-full h-full object-cover"
                    />
                  )}
                </div>

                <div>
                  <h4 className="font-bold text-base text-zinc-900 dark:text-white">
                    {draft.name || "Risoto de cogumelos"}
                  </h4>
                  <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">
                    {selectedCategoryName || "Prato principal"}
                  </p>
                  <div className="mt-2 font-bold text-base text-zinc-900 dark:text-white">
                    R$ {draft.price || "48,00"}
                  </div>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 leading-relaxed">
                    {draft.description || "Risoto cremoso de cogumelos frescos, finalizado com parmesão e ervas."}
                  </p>
                </div>
              </div>
            </div>

            {/* Card Lateral 2: Fotos e vídeo do produto */}
            <div
              id="sec-media"
              className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200/80 dark:border-zinc-800 p-6 shadow-2xs space-y-4"
            >
              <div className="flex items-center gap-2.5">
                <span className="text-[#8C3A27] dark:text-red-400">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
                    <circle cx="9" cy="9" r="2" />
                    <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
                  </svg>
                </span>
                <div>
                  <h3 className="text-sm font-bold text-zinc-900 dark:text-white">
                    Fotos e vídeo do produto
                  </h3>
                  <p className="text-xs text-zinc-400 dark:text-zinc-500 font-normal">
                    Adicione fotos e vídeos para destacar seu produto.
                  </p>
                </div>
              </div>

              {/* Grade de Miniaturas Exata da Imagem */}
              <div className="grid grid-cols-3 gap-2.5">
                {photos.slice(0, 2).map((photo) => (
                  <div
                    key={photo.id}
                    className="relative aspect-square rounded-xl overflow-hidden border border-zinc-200/80 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 group"
                  >
                    <img
                      src={photo.previewUrl || photo.url}
                      alt={photo.alt}
                      className="w-full h-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => removePhoto(photo.id)}
                      aria-label="Remover foto"
                      className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-black/60 hover:bg-black text-white flex items-center justify-center text-[10px] transition-all cursor-pointer z-10"
                    >
                      ✕
                    </button>
                  </div>
                ))}

                {photos.length === 0 && (
                  <>
                    <div className="relative aspect-square rounded-xl overflow-hidden border border-zinc-200/80 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800">
                      <img
                        src="https://images.unsplash.com/photo-1633964913295-ceb43826e7c9?auto=format&fit=crop&w=400&q=80"
                        alt="Risoto de cogumelos 1"
                        className="w-full h-full object-cover"
                      />
                      <button
                        type="button"
                        aria-label="Excluir"
                        className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center text-[10px]"
                      >
                        ✕
                      </button>
                    </div>
                    <div className="relative aspect-square rounded-xl overflow-hidden border border-zinc-200/80 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800">
                      <img
                        src="https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=400&q=80"
                        alt="Risoto de cogumelos 2"
                        className="w-full h-full object-cover"
                      />
                      <button
                        type="button"
                        aria-label="Excluir"
                        className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center text-[10px]"
                      >
                        ✕
                      </button>
                    </div>
                  </>
                )}

                {/* Botão Adicionar mais */}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="aspect-square rounded-xl border border-zinc-200/80 dark:border-zinc-700 bg-zinc-50/50 dark:bg-zinc-800/40 hover:bg-zinc-100/70 dark:hover:bg-zinc-800 flex flex-col items-center justify-center p-2 text-zinc-600 dark:text-zinc-300 transition-colors cursor-pointer"
                >
                  <span className="text-[#8C3A27] dark:text-red-400">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="8" x2="12" y2="16" />
                      <line x1="8" y1="12" x2="16" y2="12" />
                    </svg>
                  </span>
                  <span className="text-[11px] font-medium mt-1">Adicionar mais</span>
                </button>
              </div>

              {/* Área de Dropzone */}
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border border-dashed rounded-xl p-5 text-center cursor-pointer transition-all ${
                  isDragging
                    ? "border-[#8C3A27] bg-[#FAF8F5]"
                    : "border-zinc-200 dark:border-zinc-700 hover:border-[#8C3A27] bg-[#FAF8F5]/60 dark:bg-zinc-800/20"
                }`}
              >
                <span className="text-[#8C3A27] dark:text-red-400 inline-block mb-1.5">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242" />
                    <path d="M12 12v9" />
                    <path d="m16 16-4-4-4 4" />
                  </svg>
                </span>
                <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                  Arraste e solte as imagens aqui
                </p>
                <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">
                  ou clique para selecionar
                </p>
              </div>

              {/* Seção Vídeo do produto */}
              <div className="space-y-2 pt-1">
                <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200 block">
                  Vídeo do produto (opcional)
                </span>

                <div className="flex items-center gap-3">
                  {/* Thumbnail do Vídeo com Botão Play, Duração e Lixeira */}
                  <div className="relative w-40 aspect-[16/10] rounded-xl overflow-hidden bg-black/90 flex items-center justify-center border border-zinc-200 dark:border-zinc-700">
                    {video ? (
                      <video
                        src={video.previewUrl || video.url}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <img
                        src="https://images.unsplash.com/photo-1633964913295-ceb43826e7c9?auto=format&fit=crop&w=400&q=80"
                        alt="Vídeo prévia"
                        className="w-full h-full object-cover opacity-80"
                      />
                    )}

                    {/* Botão Play centralizado */}
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <div className="w-7 h-7 rounded-full bg-white/25 backdrop-blur-xs flex items-center justify-center text-white">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                          <polygon points="5 3 19 12 5 21 5 3" />
                        </svg>
                      </div>
                    </div>

                    {/* Duração 0:45 */}
                    <div className="absolute bottom-1.5 left-2 flex items-center gap-1 text-[10px] text-white/95 font-medium bg-black/40 px-1.5 py-0.5 rounded">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10" />
                        <polyline points="12 6 12 12 16 14" />
                      </svg>
                      <span>0:45</span>
                    </div>

                    {/* Ícone de Excluir */}
                    <button
                      type="button"
                      onClick={removeVideo}
                      title="Excluir vídeo"
                      className="absolute bottom-1.5 right-2 text-white/80 hover:text-white p-0.5 cursor-pointer"
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 6h18" />
                        <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                        <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                      </svg>
                    </button>
                  </div>

                  {/* Botão Substituir Vídeo */}
                  <button
                    type="button"
                    onClick={() => videoInputRef.current?.click()}
                    className="px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200 text-xs font-medium hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors cursor-pointer shadow-2xs whitespace-nowrap"
                  >
                    Substituir vídeo
                  </button>
                </div>
              </div>

              {/* Rodapé informativo */}
              <div className="p-3 rounded-xl bg-[#FAF7F2] dark:bg-zinc-800/50 border border-[#EFEAE2] dark:border-zinc-700 flex items-start gap-2.5 text-[11px] text-zinc-500 dark:text-zinc-400 leading-relaxed">
                <span className="text-[#8C3A27] shrink-0 mt-0.5">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="16" x2="12" y2="12" />
                    <line x1="12" y1="8" x2="12.01" y2="8" />
                  </svg>
                </span>
                <div>
                  Formatos aceitos: JPG, PNG ou WebP. Até 10 MB por arquivo.
                  <br />
                  Vídeos: até 60 segundos. Otimizados automaticamente para WebP.
                </div>
              </div>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
