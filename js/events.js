/* =========================================
   SNAPQUEST — EVENTS.JS
   Gestão completa de eventos com Supabase
========================================= */

(() => {
  "use strict";

  const getClient = () => window.SnapQuestSupabase?.client;

  const EventStatus = Object.freeze({
    DRAFT: "draft",
    PUBLISHED: "published",
    ENDED: "ended",
    ARCHIVED: "archived",
  });

  let events = [];
  let currentEvent = null;

  // =========================================
  // UTILITÁRIOS
  // =========================================

  function requireClient() {
    const client = getClient();

    if (!client) {
      throw new Error("Supabase não está carregado.");
    }

    return client;
  }

  function notify(message, type = "success") {
    let toast = document.querySelector("#snapquestEventToast");

    if (!toast) {
      toast = document.createElement("div");
      toast.id = "snapquestEventToast";
      toast.className = "sq-toast";
      document.body.appendChild(toast);
    }

    toast.textContent = message;
    toast.dataset.type = type;
    toast.classList.add("show");

    clearTimeout(notify.timer);

    notify.timer = setTimeout(() => {
      toast.classList.remove("show");
    }, 3500);
  }

  function emit(name, detail = {}) {
    window.dispatchEvent(new CustomEvent(`snapquest:${name}`, { detail }));
  }

  function normalizePublicId(publicId) {
    const value = String(publicId ?? "").trim();

    if (!value || !/^\d+$/.test(value)) {
      return "";
    }

    return value.padStart(6, "0");
  }

  function getPublicId(event) {
    return normalizePublicId(event?.public_id);
  }

  function normalizeDateTime(value) {
    if (value === undefined) return undefined;
    return value || null;
  }

  function normalizeEventData(data = {}) {
    return {
      ...(data.name !== undefined && {
        name: String(data.name).trim(),
      }),

      ...(data.description !== undefined && {
        description: String(data.description).trim(),
      }),

      ...(data.event_date !== undefined && {
        event_date: data.event_date || null,
      }),

      ...(data.cover_url !== undefined && {
        cover_url: data.cover_url || null,
      }),

      ...(data.status !== undefined && {
        status: data.status,
      }),

      ...(data.starts_at !== undefined && {
        starts_at: normalizeDateTime(data.starts_at),
      }),

      ...(data.ends_at !== undefined && {
        ends_at: normalizeDateTime(data.ends_at),
      }),

      ...(data.submissions_paused !== undefined && {
        submissions_paused: Boolean(data.submissions_paused),
      }),
    };
  }

  function validateEvent(data) {
    if (!data.name || data.name.length < 2) {
      throw new Error("O evento precisa de um nome válido.");
    }

    if (data.name.length > 100) {
      throw new Error("O nome do evento é demasiado longo.");
    }

    if (data.status && !Object.values(EventStatus).includes(data.status)) {
      throw new Error("Estado de evento inválido.");
    }

    if (data.starts_at && Number.isNaN(Date.parse(data.starts_at))) {
      throw new Error("A data de início do evento é inválida.");
    }

    if (data.ends_at && Number.isNaN(Date.parse(data.ends_at))) {
      throw new Error("A data de fim do evento é inválida.");
    }

    if (data.starts_at && data.ends_at) {
      if (new Date(data.ends_at) <= new Date(data.starts_at)) {
        throw new Error("A data de fim tem de ser posterior à data de início.");
      }
    }
  }

  function handleError(error, context) {
    console.error(`[SnapQuest] ${context}:`, {
      message: error?.message,
      code: error?.code,
      details: error?.details,
      hint: error?.hint,
      error,
    });
  }

  // =========================================
  // COPIAR TEXTO
  // =========================================

  async function copyText(text, successMessage) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();

        const copied = document.execCommand("copy");
        textarea.remove();

        if (!copied) {
          throw new Error("Falha ao copiar.");
        }
      }

      notify(successMessage);
    } catch (error) {
      console.error("Erro ao copiar:", error);
      notify("Não foi possível copiar.", "error");
    }
  }

  // =========================================
  // CARREGAR EVENTOS
  // =========================================

  async function loadEvents() {
    const client = requireClient();

    const { data, error } = await client
      .from("events")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      handleError(error, "Erro ao carregar eventos");
      throw error;
    }

    events = data || [];

    if (currentEvent?.id) {
      currentEvent =
        events.find((event) => event.id === currentEvent.id) || currentEvent;
    }

    emit("events-loaded", { events });

    return events;
  }

  function getEvents() {
    return [...events];
  }

  function getEventById(id) {
    return events.find((event) => event.id === id) || null;
  }

  function getEventByPublicId(publicId) {
    const normalized = normalizePublicId(publicId);

    if (!normalized) return null;

    return events.find((event) => getPublicId(event) === normalized) || null;
  }

  function getCurrentEvent() {
    return currentEvent;
  }

  function setCurrentEvent(event) {
    currentEvent = event || null;

    window.SnapQuestParticipants?.setCurrentEvent?.(currentEvent);

    emit("current-event-changed", {
      event: currentEvent,
    });
  }

  // =========================================
  // CRIAR EVENTO
  // =========================================

  async function createEvent(eventData) {
    const client = requireClient();

    const { data: authData, error: authError } = await client.auth.getUser();

    if (authError) throw authError;

    const user = authData?.user;

    if (!user) {
      throw new Error("Não existe uma sessão autenticada.");
    }

    const data = normalizeEventData(eventData);

    data.created_by = user.id;
    console.log("ID autenticado:", user.id);
    console.log("created_by enviado:", data.created_by);
    console.log("Dados completos:", JSON.stringify(data, null, 2));
    data.status = data.status || EventStatus.DRAFT;

    validateEvent(data);

    console.log("[SnapQuest] Dados enviados:", data);

    const { data: createdEvent, error } = await client
      .from("events")
      .insert(data)
      .select("*")
      .single();

    if (error) {
      handleError(error, "Erro ao criar evento");
      throw error;
    }

    events.unshift(createdEvent);

    emit("event-created", {
      event: createdEvent,
    });

    notify("Evento criado com sucesso!");

    return createdEvent;
  }

  // =========================================
  // EDITAR EVENTO
  // =========================================

  async function updateEvent(id, updates) {
    const client = requireClient();

    const data = normalizeEventData(updates);

    if (Object.keys(data).length === 0) {
      throw new Error("Não existem alterações.");
    }

    const existing =
      getEventById(id) || (currentEvent?.id === id ? currentEvent : null);

    if (!existing) {
      throw new Error("Não foi possível encontrar o evento.");
    }

    validateEvent({
      ...existing,
      ...data,
    });

    const { data: updated, error } = await client
      .from("events")
      .update(data)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      handleError(error, "Erro ao atualizar evento");
      throw error;
    }

    events = events.map((event) => (event.id === id ? updated : event));

    if (currentEvent?.id === id) {
      setCurrentEvent(updated);
    }

    emit("event-updated", {
      event: updated,
    });

    notify("Evento atualizado!");

    return updated;
  }

  // =========================================
  // ESTADOS DO EVENTO
  // =========================================

  async function publishEvent(id) {
    return updateEvent(id, {
      status: EventStatus.PUBLISHED,
    });
  }

  async function pauseSubmissions(id) {
    return updateEvent(id, {
      submissions_paused: true,
    });
  }

  async function resumeSubmissions(id) {
    const event =
      getEventById(id) || (currentEvent?.id === id ? currentEvent : null);

    if (!event) {
      throw new Error("Não foi possível encontrar o evento.");
    }

    if (event.status === EventStatus.ENDED) {
      throw new Error(
        "Não é possível retomar submissões num evento terminado.",
      );
    }

    if (event.status !== EventStatus.PUBLISHED) {
      throw new Error("Só é possível retomar submissões num evento publicado.");
    }

    return updateEvent(id, {
      submissions_paused: false,
    });
  }

  async function endEvent(id) {
    return updateEvent(id, {
      status: EventStatus.ENDED,
      submissions_paused: true,
    });
  }

  async function archiveEvent(id) {
    return updateEvent(id, {
      status: EventStatus.ARCHIVED,
      submissions_paused: true,
    });
  }

  // =========================================
  // ELIMINAR EVENTO
  // =========================================

  async function deleteEvent(id) {
    const client = requireClient();

    const { error } = await client.from("events").delete().eq("id", id);

    if (error) {
      handleError(error, "Erro ao eliminar evento");
      throw error;
    }

    events = events.filter((event) => event.id !== id);

    if (currentEvent?.id === id) {
      setCurrentEvent(null);
    }

    emit("event-deleted", { id });

    notify("Evento eliminado.");

    return true;
  }

  // =========================================
  // DUPLICAR EVENTO
  // =========================================

  async function duplicateEvent(id) {
    const client = requireClient();

    const { data: original, error } = await client
      .from("events")
      .select("*")
      .eq("id", id)
      .single();

    if (error) throw error;

    const newEvent = await createEvent({
      name: `${original.name} (cópia)`,
      description: original.description,
      event_date: null,
      cover_url: original.cover_url,
      starts_at: null,
      ends_at: null,
      submissions_paused: false,
      status: EventStatus.DRAFT,
    });

    await loadEvents();

    const createdEvent = events.find((event) => event.id === newEvent.id);

    if (!createdEvent) {
      throw new Error("Não foi possível localizar o evento duplicado.");
    }

    const { data: originalChallenges, error: challengeError } = await client
      .from("challenges")
      .select("*")
      .eq("event_id", id)
      .order("position", { ascending: true });

    if (challengeError) throw challengeError;

    if (originalChallenges?.length) {
      const copies = originalChallenges.map((challenge) => ({
        event_id: createdEvent.id,
        batch_id: null,
        title: challenge.title,
        description: challenge.description,
        image_url: challenge.image_url,
        position: challenge.position,
        status: "locked",
        submission_count: 0,
      }));

      const { error: copyError } = await client
        .from("challenges")
        .insert(copies);

      if (copyError) throw copyError;
    }

    await loadEvents();

    notify("Evento duplicado com sucesso!");

    return createdEvent;
  }

  // =========================================
  // LINKS E QR CODE
  // =========================================

  function getEventUrl(event) {
    if (!event) return "";

    const publicId = getPublicId(event);

    if (!publicId) return "";

    const basePath = window.location.href.substring(
      0,
      window.location.href.lastIndexOf("/") + 1,
    );

    return `${basePath}event.html?code=${encodeURIComponent(publicId)}`;
  }

  function getEventQRCodeUrl(event, size = 300) {
    const url = getEventUrl(event);

    if (!url) return "";

    const safeSize = Math.max(100, Math.min(1000, Number(size) || 300));

    return `https://api.qrserver.com/v1/create-qr-code/?size=${safeSize}x${safeSize}&data=${encodeURIComponent(url)}`;
  }

  // =========================================
  // ESTATÍSTICAS
  // =========================================

  async function updateEventStatistics(eventId) {
    const client = requireClient();

    const [participants, challenges, photos] = await Promise.all([
      client
        .from("event_participants")
        .select("id", { count: "exact", head: true })
        .eq("event_id", eventId),

      client
        .from("challenges")
        .select("id", { count: "exact", head: true })
        .eq("event_id", eventId),

      client
        .from("photo_submissions")
        .select("id", { count: "exact", head: true })
        .eq("event_id", eventId)
        .eq("status", "published"),
    ]);

    const errors = [participants.error, challenges.error, photos.error].filter(
      Boolean,
    );

    if (errors.length) {
      throw errors[0];
    }

    return {
      participants: participants.count || 0,
      challenges: challenges.count || 0,
      photos: photos.count || 0,
    };
  }

  async function getEventStatistics(eventId) {
    return updateEventStatistics(eventId);
  }

  // =========================================
  // PESQUISA
  // =========================================

  function searchEvents(query = "") {
    const term = query.trim().toLowerCase();

    if (!term) return getEvents();

    return events.filter(
      (event) =>
        String(event.name || "")
          .toLowerCase()
          .includes(term) ||
        String(event.description || "")
          .toLowerCase()
          .includes(term),
    );
  }

  // =========================================
  // FILTROS
  // =========================================

  function filterEvents(status = "all") {
    if (status === "all") {
      return getEvents();
    }

    return events.filter((event) => event.status === status);
  }

  // =========================================
  // RENDERIZAR EVENTOS
  // =========================================

  function renderEvents(container, list = events) {
    if (typeof container === "string") {
      container = document.querySelector(container);
    }

    if (!container) {
      container = document.querySelector(
        "#allEvents, #eventsList, .events-list",
      );
    }

    if (!container) return;

    container.replaceChildren();

    if (!list.length) {
      const empty = document.createElement("p");
      empty.className = "empty-state";
      empty.textContent = "Ainda não existem eventos.";
      container.appendChild(empty);
      return;
    }

    list.forEach((event) => {
      const item = document.createElement("article");
      item.className = "event-card";

      const cover = document.createElement("div");
      cover.className = "event-card-cover";

      if (event.cover_url) {
        const image = document.createElement("img");
        image.src = event.cover_url;
        image.alt = "";
        image.loading = "lazy";
        cover.appendChild(image);
      } else {
        cover.classList.add("event-card-cover-empty");
        cover.textContent = "SNAPQUEST";
      }

      const body = document.createElement("div");
      body.className = "event-card-body";

      const title = document.createElement("h3");
      title.textContent = event.name || "Evento sem nome";

      const date = document.createElement("p");
      date.className = "event-card-date";

      date.textContent = event.event_date
        ? new Date(`${event.event_date}T00:00:00`).toLocaleDateString("pt-PT")
        : "Data por definir";

      const status = document.createElement("span");
      status.className = `status-badge status-${event.status || "draft"}`;

      status.textContent =
        {
          draft: "Rascunho",
          published: "Publicado",
          ended: "Terminado",
          archived: "Arquivado",
        }[event.status] ||
        event.status ||
        "Rascunho";

      const codeContainer = document.createElement("div");
      codeContainer.className = "event-public-access";

      const codeLabel = document.createElement("span");
      codeLabel.className = "event-public-code-label";
      codeLabel.textContent = "Código do evento";

      const codeValue = document.createElement("strong");
      codeValue.className = "event-public-code";
      codeValue.textContent = getPublicId(event) || "Indisponível";

      codeContainer.append(codeLabel, codeValue);

      const actions = document.createElement("div");
      actions.className = "event-card-actions";

      const copyCode = document.createElement("button");
      copyCode.type = "button";
      copyCode.className = "event-card-button";
      copyCode.textContent = "Copiar código";
      copyCode.disabled = !getPublicId(event);

      copyCode.addEventListener("click", () => {
        copyText(getPublicId(event), "Código do evento copiado!");
      });

      const copyLink = document.createElement("button");
      copyLink.type = "button";
      copyLink.className = "event-card-button";
      copyLink.textContent = "Copiar link";
      copyLink.disabled = !getEventUrl(event);

      copyLink.addEventListener("click", () => {
        copyText(getEventUrl(event), "Link do evento copiado!");
      });

      const link = document.createElement("a");
      link.className = "event-card-open";
      link.href = getEventUrl(event);
      link.textContent = "Abrir evento";

      actions.append(copyCode, copyLink, link);

      body.append(title, date, status, codeContainer, actions);
      item.append(cover, body);

      container.appendChild(item);
    });
  }

  // =========================================
  // CRIAR EVENTO PELO FORMULÁRIO
  // =========================================

  async function createOrganizerEvent() {
    const form = document.querySelector("#createEventForm");

    if (!form) {
      throw new Error("Formulário de criação de evento não encontrado.");
    }

    const name =
      form.querySelector('[name="name"]')?.value ||
      form.querySelector("#eventName")?.value ||
      form.querySelector("#eventTitle")?.value ||
      form.querySelector('[name="title"]')?.value ||
      "";

    const description =
      form.querySelector('[name="description"]')?.value ||
      form.querySelector("#eventDescription")?.value ||
      form.querySelector("#eventDescriptionInput")?.value ||
      "";

    const eventDate =
      form.querySelector('[name="event_date"]')?.value ||
      form.querySelector('[name="date"]')?.value ||
      form.querySelector("#eventDate")?.value ||
      form.querySelector("#eventDateInput")?.value ||
      null;

    const startsAt =
      form.querySelector('[name="starts_at"]')?.value ||
      form.querySelector("#eventStartInput")?.value ||
      null;

    const endsAt =
      form.querySelector('[name="ends_at"]')?.value ||
      form.querySelector("#eventEndInput")?.value ||
      null;

    const cover = form.querySelector('[name="cover_url"]')?.value || null;

    try {
      const event = await createEvent({
        name,
        description,
        event_date: eventDate,
        cover_url: cover,
        starts_at: startsAt,
        ends_at: endsAt,
        submissions_paused: false,
      });

      form.reset();

      document.querySelector("#createEventModal")?.classList.remove("active");

      await loadEvents();

      renderEvents("#allEvents");
      renderEvents("#recentEvents");

      emit("organizer-event-created", { event });

      return event;
    } catch (error) {
      handleError(error, "Falha ao criar evento");

      notify(error.message || "Erro ao criar evento.", "error");

      throw error;
    }
  }

  // =========================================
  // FILTRAR EVENTOS DO ORGANIZADOR
  // =========================================

  function filterOrganizerEvents() {
    const search =
      document.querySelector("#eventSearch, [data-event-search]")?.value || "";

    const status = document.querySelector("#eventStatusFilter")?.value || "all";

    const filtered = filterEvents(status).filter((event) =>
      String(event.name || "")
        .toLowerCase()
        .includes(search.toLowerCase()),
    );

    renderEvents(
      document.querySelector("#allEvents, #eventsList, .events-list"),
      filtered,
    );

    return filtered;
  }

  // =========================================
  // API GLOBAL
  // =========================================

  window.SnapQuestEvents = Object.freeze({
    EventStatus,

    loadEvents,
    getEvents,
    getEventById,
    getEventByPublicId,
    getCurrentEvent,
    setCurrentEvent,

    createEvent,
    updateEvent,
    publishEvent,
    pauseSubmissions,
    resumeSubmissions,
    endEvent,
    archiveEvent,
    deleteEvent,
    duplicateEvent,

    getEventUrl,
    getEventQRCodeUrl,

    updateEventStatistics,
    getEventStatistics,

    searchEvents,
    filterEvents,
    renderEvents,
  });

  window.createOrganizerEvent = createOrganizerEvent;
  window.filterOrganizerEvents = filterOrganizerEvents;

  // =========================================
  // INICIALIZAÇÃO
  // =========================================

  document.addEventListener("DOMContentLoaded", async () => {
    if (!getClient()) return;

    try {
      await loadEvents();

      const container = document.querySelector(
        "#allEvents, #eventsList, .events-list",
      );

      if (container) {
        renderEvents(container);
      }
    } catch (error) {
      handleError(error, "Erro ao inicializar eventos");
    }
  });
})();
