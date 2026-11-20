/* =========================================================
   SNAPQUEST — ORGANIZER
   Painel completo de controlo dos organizadores
========================================================= */

(() => {
  "use strict";

  const api = window.SnapQuestSupabase;

  if (!api || !api.client) {
    console.error("SnapQuest: Supabase não está inicializado.");
    return;
  }

  const db = api.client;

  let currentEvent = null;

  let dashboardData = {
    participants: [],
    challenges: [],
    submissions: [],
    ranking: [],
  };

  let challengeElementsInitialized = false;
  let managementInitialized = false;

  const $ = (id) => document.getElementById(id);

  // -----------------------------------------------------
  // UTILITÁRIOS
  // -----------------------------------------------------

  function escapeHTML(value) {
    return String(value ?? "").replace(
      /[&<>"']/g,
      (char) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#039;",
        })[char],
    );
  }

  function showNotification(message, type = "success") {
    if (typeof window.showToast === "function") {
      window.showToast(message, type);
    } else {
      console.log(`[SnapQuest ${type}] ${message}`);
    }
  }

  function formatDate(value) {
    if (!value) return "Data desconhecida";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) return "Data desconhecida";

    return date.toLocaleString("pt-PT", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  }

  function getParticipantName(participant) {
    return (
      participant?.name ||
      participant?.participant_name ||
      participant?.username ||
      "Participante"
    );
  }

  function getPhotoParticipant(photo) {
    return (
      photo?.event_participants ||
      photo?.participant ||
      photo?.participants ||
      {}
    );
  }

  function getPhotoChallenge(photo) {
    return photo?.challenges || photo?.challenge || {};
  }

  function getRankingName(item) {
    return (
      item?.participant_name ||
      item?.name ||
      item?.username ||
      item?.event_participants?.name ||
      item?.participant?.name ||
      "Participante"
    );
  }

  function getRankingPoints(item) {
    return Number(
      item?.points ??
        item?.total_points ??
        item?.score ??
        item?.total_score ??
        0,
    );
  }

  function renderIcons() {
    window.lucide?.createIcons();
  }

  function getChallengeElements() {
    return {
      eventSelect: $("challengeEventSelect"),
      total: $("challengeTotal"),
      active: $("challengeActive"),
      locked: $("challengeLocked"),
      submissions: $("challengeSubmissions"),
      search: $("challengeSearch"),
      filter: $("challengeStatusFilter"),
      list: $("organizerChallengesList"),
      modal: $("challengeModal"),
      modalTitle: $("challengeModalTitle"),
      form: $("challengeForm"),
      id: $("challengeId"),
      title: $("challengeTitle"),
      description: $("challengeDescription"),
      image: $("challengeImageFile"),
      status: $("challengeStatus"),
      saveButton: $("saveChallengeButton"),
    };
  }

  // -----------------------------------------------------
  // EVENTO ATUAL
  // -----------------------------------------------------

  function setCurrentEvent(event) {
    currentEvent = event || null;

    if (currentEvent?.id) {
      window.SnapQuestEvents?.setCurrentEvent?.(currentEvent);
      window.SnapQuestChallenges?.setCurrentEvent?.(currentEvent.id);
      window.SnapQuestGallery?.setCurrentEvent?.(currentEvent.id);
      window.SnapQuestRanking?.setCurrentEvent?.(currentEvent.id);
      window.SnapQuestSubmissions?.setContext?.(currentEvent.id, null);
    }

    syncEventSelectors();
    renderEventAccessPanel(currentEvent);
    renderEventControls();
  }

  function getCurrentEvent() {
    return currentEvent;
  }

  // -----------------------------------------------------
  // VERIFICAÇÃO DE PERMISSÕES
  // -----------------------------------------------------

  async function verifyOrganizer(eventId = currentEvent?.id) {
    if (!eventId) return false;

    try {
      const { data: sessionData, error: sessionError } =
        await db.auth.getSession();

      if (sessionError || !sessionData?.session?.user) {
        return false;
      }

      const user = sessionData.session.user;

      const { data, error } = await db
        .from("event_organizers")
        .select("id")
        .eq("event_id", eventId)
        .eq("user_id", user.id)
        .maybeSingle();

      if (error) {
        console.error("Erro ao verificar organizador:", error);
        return false;
      }

      return !!data;
    } catch (error) {
      console.error("Erro de autorização:", error);
      return false;
    }
  }

  async function requireOrganizer() {
    if (!currentEvent?.id) {
      throw new Error("Seleciona primeiro um evento.");
    }

    const authorized = await verifyOrganizer(currentEvent.id);

    if (!authorized) {
      throw new Error("Não tens permissões para gerir este evento.");
    }

    return true;
  }

  // -----------------------------------------------------
  // CÓDIGO E LINK DO EVENTO
  // -----------------------------------------------------

  function renderEventAccessPanel(event) {
    const elements = getChallengeElements();

    if (!elements.eventSelect) return;

    let panel = $("eventAccessPanel");

    if (!panel) {
      panel = document.createElement("div");
      panel.id = "eventAccessPanel";
      elements.eventSelect.insertAdjacentElement("afterend", panel);
    }

    if (!event) {
      panel.innerHTML = "";
      return;
    }

    if (!event.public_id) {
      panel.innerHTML = `
        <p>Este evento ainda não tem um código público.</p>
      `;
      return;
    }

    const code = String(event.public_id).padStart(6, "0");

    const eventUrl = new URL("event.html", window.location.href);
    eventUrl.searchParams.set("code", code);

    panel.innerHTML = `
      <div class="event-access-panel">
        <h3>Acesso ao evento</h3>

        <label for="eventPublicCode">Código do evento</label>

        <div class="event-access-row">
          <input id="eventPublicCode" readonly value="${escapeHTML(code)}">
          <button type="button" id="copyEventCode">Copiar código</button>
        </div>

        <label for="eventPublicLink">Link para participantes</label>

        <div class="event-access-row">
          <input id="eventPublicLink" readonly value="${escapeHTML(eventUrl.href)}">
          <button type="button" id="copyEventLink">Copiar link</button>
        </div>
      </div>
    `;

    $("copyEventCode")?.addEventListener("click", () => {
      copyText(code, "Código copiado!");
    });

    $("copyEventLink")?.addEventListener("click", () => {
      copyText(eventUrl.href, "Link copiado!");
    });
  }

  async function copyText(value, successMessage) {
    try {
      await navigator.clipboard.writeText(value);
      showNotification(successMessage);
    } catch {
      showNotification("Não foi possível copiar.", "error");
    }
  }

  // -----------------------------------------------------
  // SELETORES DE EVENTO
  // -----------------------------------------------------

  function getAllEventSelectors() {
    return [
      $("challengeEventSelect"),
      $("participantsEventSelect"),
      $("photosEventSelect"),
      $("rankingEventSelect"),
    ].filter(Boolean);
  }

  async function populateEventSelector() {
    let events = window.SnapQuestEvents?.getEvents?.() || [];

    if (!events.length && window.SnapQuestEvents?.loadEvents) {
      try {
        await window.SnapQuestEvents.loadEvents();
        events = window.SnapQuestEvents.getEvents?.() || [];
      } catch (error) {
        console.error("Erro ao carregar eventos:", error);
      }
    }

    getAllEventSelectors().forEach((select) => {
      const previousValue = select.value;

      select.innerHTML = `
        <option value="">Seleciona um evento</option>
      `;

      events.forEach((event) => {
        const option = document.createElement("option");
        option.value = event.id;
        option.textContent = event.name || event.title || "Evento sem nome";
        select.appendChild(option);
      });

      if (currentEvent?.id) {
        select.value = currentEvent.id;
      } else if (previousValue) {
        select.value = previousValue;
      }
    });
  }

  function syncEventSelectors() {
    getAllEventSelectors().forEach((select) => {
      select.value = currentEvent?.id || "";
    });
  }

  function createManagementSelectors() {
    const sections = [
      {
        section: "participantsSection",
        id: "participantsEventSelect",
        label: "Evento selecionado",
      },
      {
        section: "photosSection",
        id: "photosEventSelect",
        label: "Evento selecionado",
      },
      {
        section: "rankingSection",
        id: "rankingEventSelect",
        label: "Evento selecionado",
      },
    ];

    sections.forEach(({ section, id, label }) => {
      const container = $(section);

      if (!container || $(id)) return;

      const selector = document.createElement("div");
      selector.className = "challenge-event-selector";
      selector.innerHTML = `
        <label for="${id}">${label}</label>
        <select id="${id}">
          <option value="">Seleciona um evento</option>
        </select>
      `;

      const heading = container.querySelector(".section-page-heading");

      if (heading) {
        heading.insertAdjacentElement("afterend", selector);
      } else {
        container.prepend(selector);
      }

      selector.querySelector("select").addEventListener("change", (event) => {
        selectEvent(event.target.value);
      });
    });
  }

  // -----------------------------------------------------
  // SELECIONAR EVENTO
  // -----------------------------------------------------

  async function selectEvent(eventId) {
    if (!eventId) {
      setCurrentEvent(null);

      dashboardData = {
        participants: [],
        challenges: [],
        submissions: [],
        ranking: [],
      };

      renderAllManagementSections();
      return;
    }

    const events = window.SnapQuestEvents?.getEvents?.() || [];

    const event = events.find((item) => String(item.id) === String(eventId));

    if (!event) {
      showNotification("Não foi possível encontrar esse evento.", "error");
      return;
    }

    setCurrentEvent(event);

    const authorized = await verifyOrganizer(event.id);

    if (!authorized) {
      setCurrentEvent(null);

      showNotification("Não tens permissões para gerir este evento.", "error");

      renderAllManagementSections();
      return;
    }

    try {
      await loadDashboard(event.id);
      renderAllManagementSections();

      showNotification("Evento selecionado.");
    } catch (error) {
      console.error("Erro ao carregar evento:", error);
      showNotification(error.message || "Erro ao carregar o evento.", "error");
    }
  }
  window.selectEvent = selectEvent;

  // -----------------------------------------------------
  // CARREGAR DASHBOARD
  // -----------------------------------------------------

  async function loadDashboard(eventId = currentEvent?.id) {
    if (!eventId) {
      throw new Error("Seleciona primeiro um evento.");
    }

    if (!(await verifyOrganizer(eventId))) {
      throw new Error("Não tens permissões para gerir este evento.");
    }

    const [participants, challenges, submissions, ranking] = await Promise.all([
      window.SnapQuestParticipants.loadParticipants(eventId),
      window.SnapQuestChallenges.loadChallenges(eventId),
      window.SnapQuestSubmissions.loadSubmissions(eventId),
      window.SnapQuestRanking.loadRanking(eventId),
    ]);

    dashboardData = {
      participants: participants || [],
      challenges: challenges || [],
      submissions: submissions || [],
      ranking: ranking || [],
    };

    return dashboardData;
  }

  function getDashboardData() {
    return dashboardData;
  }

  function getDashboardStatistics() {
    return {
      participants: dashboardData.participants.length,
      challenges: dashboardData.challenges.length,
      submissions: dashboardData.submissions.length,
      likes: dashboardData.submissions.reduce(
        (total, photo) => total + (photo.photo_likes?.length || 0),
        0,
      ),
    };
  }

  async function refreshDashboard() {
    await loadDashboard();
    renderAllManagementSections();
    return dashboardData;
  }

  // -----------------------------------------------------
  // PARTICIPANTES
  // -----------------------------------------------------

  function renderParticipants() {
    const container = $("participantsList");

    if (!container) return;

    if (!currentEvent) {
      container.innerHTML = emptyState(
        "users",
        "Seleciona um evento",
        "Escolhe um evento para consultar os participantes.",
      );
      return;
    }

    const participants = dashboardData.participants || [];

    if (!participants.length) {
      container.innerHTML = emptyState(
        "user-round",
        "Ainda não existem participantes",
        "Quando alguém entrar no evento, aparecerá aqui.",
      );
      return;
    }

    container.innerHTML = `
      <div class="organizer-table-wrap">
        <table class="organizer-table">
          <thead>
            <tr>
              <th>Participante</th>
              <th>Entrada</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${participants
              .map((participant) => {
                const name = getParticipantName(participant);
                const avatar = participant.avatar_url;

                return `
                <tr>
                  <td>
                    <div class="organizer-person">
                      ${
                        avatar
                          ? `<img src="${escapeHTML(avatar)}" alt="">`
                          : `<span class="organizer-avatar">${escapeHTML(name.charAt(0).toUpperCase())}</span>`
                      }
                      <strong>${escapeHTML(name)}</strong>
                    </div>
                  </td>
                  <td>${escapeHTML(formatDate(participant.created_at))}</td>
                  <td>
                    <button
                      class="organizer-danger-button"
                      data-remove-participant="${escapeHTML(participant.id)}"
                    >
                      <i data-lucide="user-x"></i>
                      Remover
                    </button>
                  </td>
                </tr>
              `;
              })
              .join("")}
          </tbody>
        </table>
      </div>
    `;

    renderIcons();
  }

  async function removeParticipant(participantId) {
    await requireOrganizer();

    if (
      !window.confirm("Tens a certeza de que queres remover este participante?")
    ) {
      return false;
    }

    const result =
      await window.SnapQuestParticipants.removeParticipant(participantId);

    await refreshDashboard();

    showNotification("Participante removido.");
    return result;
  }

  // -----------------------------------------------------
  // FOTOGRAFIAS
  // -----------------------------------------------------

  function renderPhotos() {
    const container = $("photosList");

    if (!container) return;

    if (!currentEvent) {
      container.innerHTML = emptyState(
        "images",
        "Seleciona um evento",
        "Escolhe um evento para consultar as fotografias.",
      );
      return;
    }

    const photos = dashboardData.submissions || [];

    if (!photos.length) {
      container.innerHTML = emptyState(
        "camera",
        "Ainda não existem fotografias",
        "As fotografias enviadas pelos participantes aparecerão aqui.",
      );
      return;
    }

    container.innerHTML = `
      <div class="organizer-photo-grid">
        ${photos
          .map((photo) => {
            const participant = getPhotoParticipant(photo);
            const challenge = getPhotoChallenge(photo);

            const name = getParticipantName(participant);
            const imageUrl = photo.image_url || "";
            const challengeName = challenge.title || "Desafio";

            return `
            <article class="organizer-photo-card">
              <a
                href="${escapeHTML(imageUrl)}"
                target="_blank"
                rel="noopener noreferrer"
                class="organizer-photo-image"
              >
                <img
                  src="${escapeHTML(imageUrl)}"
                  alt="Fotografia de ${escapeHTML(name)}"
                  loading="lazy"
                >
              </a>

              <div class="organizer-photo-info">
                <strong>${escapeHTML(name)}</strong>
                <span>${escapeHTML(challengeName)}</span>

                ${photo.caption ? `<p>${escapeHTML(photo.caption)}</p>` : ""}

                <small>${escapeHTML(formatDate(photo.created_at))}</small>

                <button
                  class="organizer-danger-button"
                  data-delete-photo="${escapeHTML(photo.id)}"
                >
                  <i data-lucide="trash-2"></i>
                  Eliminar fotografia
                </button>
              </div>
            </article>
          `;
          })
          .join("")}
      </div>
    `;

    renderIcons();
  }

  async function deletePhoto(photoId) {
    await requireOrganizer();

    if (!window.confirm("Queres eliminar definitivamente esta fotografia?")) {
      return false;
    }

    const result = await window.SnapQuestSubmissions.deleteSubmission(photoId);

    await refreshDashboard();

    showNotification("Fotografia eliminada.");
    return result;
  }

  // -----------------------------------------------------
  // RANKING
  // -----------------------------------------------------

  function renderRanking() {
    const container = $("rankingList");

    if (!container) return;

    if (!currentEvent) {
      container.innerHTML = emptyState(
        "trophy",
        "Seleciona um evento",
        "Escolhe um evento para consultar o ranking.",
      );
      return;
    }

    const ranking = dashboardData.ranking || [];

    if (!ranking.length) {
      container.innerHTML = emptyState(
        "medal",
        "Ranking ainda vazio",
        "A classificação aparecerá quando existirem resultados.",
      );
      return;
    }

    container.innerHTML = `
      <div class="organizer-ranking-list">
        ${ranking
          .map((item, index) => {
            const position = Number(item.rank || index + 1);
            const name = getRankingName(item);
            const points = getRankingPoints(item);

            const medal =
              position === 1
                ? "🥇"
                : position === 2
                  ? "🥈"
                  : position === 3
                    ? "🥉"
                    : `#${position}`;

            return `
            <article class="organizer-ranking-item ${position <= 3 ? "top-three" : ""}">
              <div class="organizer-ranking-position">${medal}</div>

              <div class="organizer-ranking-person">
                <strong>${escapeHTML(name)}</strong>
                <small>${escapeHTML(String(item.completed_challenges ?? item.challenges_completed ?? 0))} desafios concluídos</small>
              </div>

              <div class="organizer-ranking-points">
                <strong>${points}</strong>
                <span>pontos</span>
              </div>
            </article>
          `;
          })
          .join("")}
      </div>
    `;
  }

  // -----------------------------------------------------
  // ESTADO E CONTROLOS DO EVENTO
  // -----------------------------------------------------

  function renderEventControls() {
    const container = $("eventControls");

    if (!container) return;

    if (!currentEvent) {
      container.innerHTML = emptyState(
        "calendar",
        "Nenhum evento selecionado",
        "Seleciona um evento para aceder aos controlos.",
      );
      return;
    }

    const status = currentEvent.status || "draft";
    const paused = currentEvent.submissions_paused === true;
    const ended = status === "ended" || status === "archived";

    const statusLabels = {
      draft: "Rascunho",
      published: "Publicado",
      ended: "Encerrado",
      archived: "Arquivado",
    };

    container.innerHTML = `
      <div class="organizer-event-controls">
        <div class="organizer-event-status">
          <div>
            <span>Estado do evento</span>
            <strong>${escapeHTML(statusLabels[status] || status)}</strong>
          </div>

          <div>
            <span>Submissões</span>
            <strong>${ended ? "Encerradas" : paused ? "Em pausa" : "Ativas"}</strong>
          </div>
        </div>

        <div class="organizer-control-actions">
          ${
            status === "draft"
              ? `<button class="btn-primary" id="publishEventButton">
                   <i data-lucide="globe"></i>
                   Publicar evento
                 </button>`
              : ""
          }

          ${
            status === "published" && !paused
              ? `<button class="btn-secondary" id="pauseSubmissionsButton">
                   <i data-lucide="pause"></i>
                   Pausar submissões
                 </button>`
              : ""
          }

          ${
            status === "published" && paused
              ? `<button class="btn-primary" id="resumeSubmissionsButton">
                   <i data-lucide="play"></i>
                   Retomar submissões
                 </button>`
              : ""
          }

          ${
            status === "published"
              ? `<button class="organizer-danger-button" id="endEventButton">
                   <i data-lucide="flag"></i>
                   Encerrar evento
                 </button>`
              : ""
          }
        </div>
      </div>
    `;

    $("publishEventButton")?.addEventListener("click", publishEvent);
    $("pauseSubmissionsButton")?.addEventListener("click", pauseSubmissions);
    $("resumeSubmissionsButton")?.addEventListener("click", resumeSubmissions);
    $("endEventButton")?.addEventListener("click", endEvent);

    renderIcons();
  }

  async function pauseSubmissions() {
    await requireOrganizer();

    if (currentEvent.status !== "published") {
      throw new Error("Só podes pausar submissões num evento publicado.");
    }

    if (!window.confirm("Queres pausar temporariamente as submissões?")) {
      return false;
    }

    try {
      const result = await window.SnapQuestEvents.pauseSubmissions(
        currentEvent.id,
      );

      setCurrentEvent(
        result || {
          ...currentEvent,
          submissions_paused: true,
        },
      );

      showNotification("Submissões pausadas.");
      return result;
    } catch (error) {
      showNotification(error.message || "Não foi possível pausar.", "error");
      throw error;
    }
  }

  async function resumeSubmissions() {
    await requireOrganizer();

    if (currentEvent.status !== "published") {
      throw new Error("Só podes retomar submissões num evento publicado.");
    }

    try {
      const result = await window.SnapQuestEvents.resumeSubmissions(
        currentEvent.id,
      );

      setCurrentEvent(
        result || {
          ...currentEvent,
          submissions_paused: false,
        },
      );

      showNotification("Submissões retomadas.");
      return result;
    } catch (error) {
      showNotification(error.message || "Não foi possível retomar.", "error");
      throw error;
    }
  }

  async function publishEvent() {
    await requireOrganizer();

    try {
      const result = await window.SnapQuestEvents.publishEvent(currentEvent.id);

      setCurrentEvent(
        result || {
          ...currentEvent,
          status: "published",
        },
      );

      showNotification("Evento publicado!");
      return result;
    } catch (error) {
      showNotification(error.message || "Não foi possível publicar.", "error");
      throw error;
    }
  }

  async function endEvent() {
    await requireOrganizer();

    if (currentEvent.status !== "published") {
      throw new Error("Este evento não pode ser encerrado neste estado.");
    }

    if (
      !window.confirm(
        "Queres terminar este evento? As submissões serão encerradas.",
      )
    ) {
      return false;
    }

    try {
      const result = await window.SnapQuestEvents.endEvent(currentEvent.id);

      setCurrentEvent(
        result || {
          ...currentEvent,
          status: "ended",
          submissions_paused: true,
        },
      );

      showNotification("Evento encerrado.");
      return result;
    } catch (error) {
      showNotification(error.message || "Não foi possível encerrar.", "error");
      throw error;
    }
  }

  // -----------------------------------------------------
  // ESTADOS VAZIOS
  // -----------------------------------------------------

  function emptyState(icon, title, description) {
    return `
      <div class="dashboard-placeholder">
        <i data-lucide="${escapeHTML(icon)}"></i>
        <h3>${escapeHTML(title)}</h3>
        <p>${escapeHTML(description)}</p>
      </div>
    `;
  }

  function renderAllManagementSections() {
    renderParticipants();
    renderPhotos();
    renderRanking();
    renderEventControls();
    renderChallengeStatistics();
    renderChallenges();
    renderIcons();
  }

  // -----------------------------------------------------
  // AÇÕES DAS LISTAS
  // -----------------------------------------------------

  function initializeManagementActions() {
    if (managementInitialized) return;

    managementInitialized = true;

    $("participantsSection")?.addEventListener("click", async (event) => {
      const button = event.target.closest("[data-remove-participant]");
      if (!button) return;

      button.disabled = true;

      try {
        await removeParticipant(button.dataset.removeParticipant);
      } catch (error) {
        showNotification(
          error.message || "Erro ao remover participante.",
          "error",
        );
      } finally {
        button.disabled = false;
      }
    });

    $("photosSection")?.addEventListener("click", async (event) => {
      const button = event.target.closest("[data-delete-photo]");
      if (!button) return;

      button.disabled = true;

      try {
        await deletePhoto(button.dataset.deletePhoto);
      } catch (error) {
        showNotification(
          error.message || "Erro ao eliminar fotografia.",
          "error",
        );
      } finally {
        button.disabled = false;
      }
    });
  }

  // -----------------------------------------------------
  // GESTÃO DE DESAFIOS
  // -----------------------------------------------------

  async function createChallenge(data) {
    await requireOrganizer();

    const result = await window.SnapQuestChallenges.createChallenge({
      ...data,
      event_id: currentEvent.id,
    });

    await loadChallengeInterface();
    return result;
  }

  async function updateChallenge(challengeId, updates) {
    await requireOrganizer();

    const result = await window.SnapQuestChallenges.updateChallenge(
      challengeId,
      updates,
    );

    await loadChallengeInterface();
    return result;
  }

  async function unlockChallenge(challengeId) {
    await requireOrganizer();

    const result =
      await window.SnapQuestChallenges.unlockChallenge(challengeId);

    await loadChallengeInterface();
    return result;
  }

  async function endChallenge(challengeId) {
    await requireOrganizer();

    const result = await window.SnapQuestChallenges.endChallenge(challengeId);

    await loadChallengeInterface();
    return result;
  }

  async function deleteChallenge(challengeId) {
    await requireOrganizer();

    if (!window.confirm("Queres mesmo eliminar este desafio?")) {
      return false;
    }

    const result =
      await window.SnapQuestChallenges.deleteChallenge(challengeId);

    await loadChallengeInterface();
    return result;
  }

  async function loadChallengeInterface() {
    const elements = getChallengeElements();

    if (!currentEvent) {
      dashboardData.challenges = [];
      renderChallengeStatistics();
      renderChallenges();
      return;
    }

    if (elements.list) {
      elements.list.innerHTML = `
        <div class="challenge-empty">
          <p>A carregar desafios...</p>
        </div>
      `;
    }

    try {
      const challenges = await window.SnapQuestChallenges.loadChallenges(
        currentEvent.id,
      );

      dashboardData.challenges = challenges || [];

      renderChallengeStatistics();
      renderChallenges();

      return dashboardData.challenges;
    } catch (error) {
      console.error("Erro ao carregar desafios:", error);

      if (elements.list) {
        elements.list.innerHTML = `
          <div class="challenge-empty">
            <h3>Erro ao carregar desafios</h3>
            <p>${escapeHTML(error.message)}</p>
          </div>
        `;
      }

      throw error;
    }
  }

  function renderChallengeStatistics() {
    const elements = getChallengeElements();
    const challenges = dashboardData.challenges || [];

    const total = challenges.length;

    const active = challenges.filter(
      (challenge) => challenge.status === "available",
    ).length;

    const locked = challenges.filter(
      (challenge) => challenge.status === "locked",
    ).length;

    const submissions = challenges.reduce(
      (sum, challenge) => sum + Number(challenge.submission_count || 0),
      0,
    );

    if (elements.total) elements.total.textContent = total;
    if (elements.active) elements.active.textContent = active;
    if (elements.locked) elements.locked.textContent = locked;

    if (elements.submissions) {
      elements.submissions.textContent = submissions;
    }
  }

  function renderChallenges() {
    const elements = getChallengeElements();

    if (!elements.list) return;

    if (!currentEvent) {
      elements.list.innerHTML = emptyState(
        "target",
        "Seleciona um evento",
        "Escolhe um evento para veres e gerires os seus desafios.",
      );
      return;
    }

    const search = elements.search?.value.trim().toLowerCase() || "";
    const statusFilter = elements.filter?.value || "all";

    let challenges = [...dashboardData.challenges];

    if (search) {
      challenges = challenges.filter(
        (challenge) =>
          (challenge.title || "").toLowerCase().includes(search) ||
          (challenge.description || "").toLowerCase().includes(search),
      );
    }

    if (statusFilter !== "all") {
      challenges = challenges.filter(
        (challenge) => challenge.status === statusFilter,
      );
    }

    challenges.sort(
      (a, b) => Number(a.position || 0) - Number(b.position || 0),
    );

    if (!challenges.length) {
      elements.list.innerHTML = emptyState(
        "target",
        "Nenhum desafio encontrado",
        "Ainda não existem desafios ou não há resultados para os filtros.",
      );
      return;
    }

    const statusLabels = {
      locked: "Bloqueado",
      available: "Disponível",
      ended: "Terminado",
      completed: "Concluído",
    };

    elements.list.innerHTML = challenges
      .map((challenge) => {
        const status = challenge.status || "locked";

        const image = challenge.image_url
          ? `<img class="challenge-card-image" src="${escapeHTML(challenge.image_url)}" alt="" loading="lazy">`
          : `<div class="challenge-card-image"></div>`;

        let actions = `
        <button class="challenge-action-button" data-action="edit" data-id="${escapeHTML(challenge.id)}">
          <i data-lucide="pencil"></i> Editar
        </button>
      `;

        if (status === "locked") {
          actions += `
          <button class="challenge-action-button" data-action="unlock" data-id="${escapeHTML(challenge.id)}">
            <i data-lucide="unlock"></i> Desbloquear
          </button>
        `;
        }

        if (status === "available") {
          actions += `
          <button class="challenge-action-button" data-action="end" data-id="${escapeHTML(challenge.id)}">
            <i data-lucide="check-circle"></i> Terminar
          </button>
        `;
        }

        actions += `
        <button class="challenge-action-button delete" data-action="delete" data-id="${escapeHTML(challenge.id)}">
          <i data-lucide="trash-2"></i> Eliminar
        </button>
      `;

        return `
        <article class="challenge-card">
          ${image}

          <div class="challenge-card-content">
            <h3>${escapeHTML(challenge.title)}</h3>
            <p>${escapeHTML(challenge.description || "Sem descrição.")}</p>

            <div class="challenge-card-meta">
              <span class="challenge-status ${escapeHTML(status)}">
                ${escapeHTML(statusLabels[status] || status)}
              </span>

              <span>${Number(challenge.submission_count || 0)} fotografias</span>
              <span>Posição ${Number(challenge.position || 0) + 1}</span>
            </div>
          </div>

          <div class="challenge-card-actions">
            ${actions}
          </div>
        </article>
      `;
      })
      .join("");

    renderIcons();
  }

  // -----------------------------------------------------
  // MODAL DE DESAFIOS
  // -----------------------------------------------------

  function openChallengeModal(challenge = null) {
    const elements = getChallengeElements();

    if (!elements.modal || !elements.form) return;

    elements.form.reset();

    if (elements.id) elements.id.value = challenge?.id || "";
    if (elements.title) elements.title.value = challenge?.title || "";
    if (elements.description)
      elements.description.value = challenge?.description || "";
    if (elements.image) elements.image.value = "";

    const preview = $("challengeImagePreview");

    if (preview) {
      preview.replaceChildren();

      if (challenge?.image_url) {
        const image = document.createElement("img");
        image.src = challenge.image_url;
        image.alt = "Ilustração atual do desafio";
        image.style.maxWidth = "220px";
        image.style.maxHeight = "140px";
        image.style.objectFit = "cover";
        image.style.borderRadius = "12px";

        preview.appendChild(image);
      }
    }

    if (elements.status) {
      elements.status.value =
        challenge?.status === "available" ? "active" : "locked";
    }

    if (elements.modalTitle) {
      elements.modalTitle.textContent = challenge
        ? "Editar desafio"
        : "Novo desafio";
    }

    if (elements.saveButton) {
      elements.saveButton.textContent = challenge
        ? "Guardar alterações"
        : "Guardar desafio";
    }

    elements.modal.classList.add("active");
    elements.modal.style.display = "flex";
    elements.title?.focus();
  }

  function closeChallengeModal() {
    const modal = $("challengeModal");

    if (!modal) return;

    modal.classList.remove("active");
    modal.style.display = "none";
  }

  async function handleChallengeSubmit(event) {
    event.preventDefault();

    if (!currentEvent) {
      showNotification("Seleciona primeiro um evento.", "error");
      return;
    }

    const elements = getChallengeElements();

    const title = elements.title.value.trim();
    const description = elements.description.value.trim();
    const imageFile = elements.image?.files?.[0] || null;
    const status = elements.status.value;
    const challengeId = elements.id.value;

    if (!title) {
      showNotification("O nome do desafio é obrigatório.", "error");
      return;
    }

    const maxSize = 8 * 1024 * 1024;
    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];

    if (imageFile) {
      if (!allowedTypes.includes(imageFile.type)) {
        showNotification("Usa uma imagem JPG, PNG ou WEBP.", "error");
        return;
      }

      if (imageFile.size > maxSize) {
        showNotification("A imagem não pode ultrapassar 8 MB.", "error");
        return;
      }
    }

    const existingChallenge = challengeId
      ? dashboardData.challenges.find(
          (item) => String(item.id) === String(challengeId),
        )
      : null;

    let imageUrl = existingChallenge?.image_url || null;

    try {
      elements.saveButton.disabled = true;
      elements.saveButton.textContent = "A guardar...";

      if (imageFile) {
        elements.saveButton.textContent = "A carregar imagem...";

        imageUrl = await window.SnapQuestEvents.uploadImage(
          imageFile,
          `challenges/illustrations/${currentEvent.id}`,
        );
      }

      const data = {
        title,
        description,
        image_url: imageUrl,
        status,
      };

      elements.saveButton.textContent = "A guardar desafio...";

      if (challengeId) {
        await updateChallenge(challengeId, data);
        showNotification("Desafio atualizado!");
      } else {
        await createChallenge(data);
        showNotification("Desafio criado!");
      }

      closeChallengeModal();
    } catch (error) {
      console.error("Erro ao guardar desafio:", error);

      showNotification(error.message || "Não foi possível guardar.", "error");
    } finally {
      elements.saveButton.disabled = false;
      elements.saveButton.textContent = challengeId
        ? "Guardar alterações"
        : "Guardar desafio";
    }
  }

  async function handleChallengeAction(event) {
    const button = event.target.closest("[data-action]");

    if (!button) return;

    const action = button.dataset.action;
    const challengeId = button.dataset.id;

    if (!challengeId) return;

    const challenge = dashboardData.challenges.find(
      (item) => String(item.id) === String(challengeId),
    );

    if (!challenge) return;

    try {
      button.disabled = true;

      switch (action) {
        case "edit":
          openChallengeModal(challenge);
          break;

        case "unlock":
          if (window.confirm("Queres desbloquear este desafio?")) {
            await unlockChallenge(challengeId);
            showNotification("Desafio desbloqueado!");
          }
          break;

        case "end":
          if (window.confirm("Queres terminar este desafio?")) {
            await endChallenge(challengeId);
            showNotification("Desafio terminado!");
          }
          break;

        case "delete":
          if (await deleteChallenge(challengeId)) {
            showNotification("Desafio eliminado!");
          }
          break;
      }
    } catch (error) {
      showNotification(error.message || "Ocorreu um erro.", "error");
    } finally {
      button.disabled = false;
    }
  }

  // -----------------------------------------------------
  // INICIALIZAR DESAFIOS
  // -----------------------------------------------------

  function initializeChallengeInterface() {
    if (challengeElementsInitialized) return;

    const elements = getChallengeElements();

    if (!elements.eventSelect || !elements.list) {
      console.warn("SnapQuest: elementos de desafios não encontrados.");
      return;
    }

    challengeElementsInitialized = true;

    $("createChallengeButton")?.addEventListener("click", () => {
      if (!currentEvent) {
        showNotification("Seleciona primeiro um evento.", "error");
        return;
      }

      openChallengeModal();
    });

    $("closeChallengeModal")?.addEventListener("click", closeChallengeModal);
    $("cancelChallengeModal")?.addEventListener("click", closeChallengeModal);

    elements.modal?.addEventListener("click", (event) => {
      if (event.target === elements.modal) {
        closeChallengeModal();
      }
    });

    elements.form?.addEventListener("submit", handleChallengeSubmit);
    elements.image?.addEventListener("change", () => {
      const preview = $("challengeImagePreview");

      if (!preview) return;

      preview.replaceChildren();

      const file = elements.image.files?.[0];

      if (!file) return;

      if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
        showNotification("Formato inválido. Usa JPG, PNG ou WEBP.", "error");
        elements.image.value = "";
        return;
      }

      if (file.size > 8 * 1024 * 1024) {
        showNotification("A imagem não pode ultrapassar 8 MB.", "error");
        elements.image.value = "";
        return;
      }

      const image = document.createElement("img");
      image.src = URL.createObjectURL(file);
      image.alt = "Pré-visualização da ilustração";
      image.style.maxWidth = "220px";
      image.style.maxHeight = "140px";
      image.style.objectFit = "cover";
      image.style.borderRadius = "12px";

      preview.appendChild(image);
    });

    elements.eventSelect.addEventListener("change", (event) => {
      selectEvent(event.target.value);
    });

    elements.search?.addEventListener("input", renderChallenges);
    elements.filter?.addEventListener("change", renderChallenges);
    elements.list.addEventListener("click", handleChallengeAction);
  }

  // -----------------------------------------------------
  // INICIALIZAÇÃO
  // -----------------------------------------------------

  async function initialize() {
    createManagementSelectors();
    initializeChallengeInterface();
    initializeManagementActions();

    await populateEventSelector();

    renderAllManagementSections();
  }

  // -----------------------------------------------------
  // API PÚBLICA
  // -----------------------------------------------------

  window.SnapQuestOrganizer = {
    setCurrentEvent,
    getCurrentEvent,

    verifyOrganizer,
    requireOrganizer,

    loadDashboard,
    getDashboardData,
    getDashboardStatistics,
    refreshDashboard,

    selectEvent,
    populateEventSelector,

    renderParticipants,
    renderPhotos,
    renderRanking,
    renderEventControls,
    renderAllManagementSections,

    removeParticipant,
    deletePhoto,

    pauseSubmissions,
    resumeSubmissions,
    publishEvent,
    endEvent,

    createChallenge,
    updateChallenge,
    unlockChallenge,
    endChallenge,
    deleteChallenge,

    loadChallengeInterface,
    renderChallenges,
    openChallengeModal,
    closeChallengeModal,

    renderEventAccessPanel,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize);
  } else {
    initialize();
  }
})();
