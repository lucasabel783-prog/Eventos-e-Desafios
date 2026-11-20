
/* =========================================================
   SNAPQUEST — MODO PROJETOR
   Galeria automática em ecrã inteiro
========================================================= */

(() => {
  "use strict";

  const db = window.SnapQuestSupabase?.client;
  const submissionsAPI = window.SnapQuestSubmissions;

  if (!db || !submissionsAPI) {
    console.error("[SnapQuest Projector] Supabase ou Submissions não disponíveis.");
    return;
  }

  const BUCKET = "photos";

  const eventSelect = document.getElementById("projectorEventSelect");
  const startButton = document.getElementById("startProjectorButton");
  const overlay = document.getElementById("projectorOverlay");
  const closeButton = document.getElementById("closeProjectorButton");
  const image = document.getElementById("projectorImage");
  const participant = document.getElementById("projectorParticipant");
  const caption = document.getElementById("projectorCaption");
  const counter = document.getElementById("projectorCounter");
  const message = document.getElementById("projectorMessage");

  if (
    !eventSelect || !startButton || !overlay || !closeButton ||
    !image || !participant || !caption || !counter || !message
  ) {
    console.error("[SnapQuest Projector] Elementos HTML em falta.");
    return;
  }

  let photos = [];
  let currentIndex = 0;
  let rotationTimer = null;
  let refreshTimer = null;
  let realtimeChannel = null;
  let loading = false;
  let activeEventId = null;
  let projectorSession = 0;

  const ROTATION_INTERVAL = 6000;
  const REFRESH_INTERVAL = 10000;

  // =========================================
  // MENSAGENS
  // =========================================

  function showMessage(text) {
    message.textContent = text;
    message.hidden = false;
  }

  function hideMessage() {
    message.hidden = true;
  }

  function logError(context, error) {
    console.error(`[SnapQuest Projector] ${context}:`, {
      message: error?.message,
      code: error?.code,
      details: error?.details,
      hint: error?.hint,
      error
    });
  }

  // =========================================
  // CARREGAR EVENTOS
  // =========================================

  async function loadEvents() {
    eventSelect.disabled = true;
    eventSelect.innerHTML =
      '<option value="">A carregar eventos...</option>';

    try {
      const { data, error } = await db
        .from("events")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;

      eventSelect.innerHTML =
        '<option value="">Seleciona um evento</option>';

      (data || []).forEach((event) => {
        const option = document.createElement("option");

        option.value = event.id;
        option.textContent =
          event.title || event.name || "Evento sem título";

        eventSelect.appendChild(option);
      });

      if (!data || data.length === 0) {
        eventSelect.innerHTML =
          '<option value="">Ainda não existem eventos</option>';
      }

      console.log(
        `[SnapQuest Projector] ${data?.length || 0} eventos carregados.`
      );

    } catch (error) {
      logError("Erro ao carregar eventos", error);

      eventSelect.innerHTML =
        '<option value="">Não foi possível carregar os eventos</option>';

    } finally {
      eventSelect.disabled = false;
    }
  }

  // =========================================
  // OBTER URL DA FOTOGRAFIA
  // =========================================

  function getPhotoUrl(photo) {
    // Se já existir URL, utilizá-lo.
    if (photo.image_url) {
      return photo.image_url;
    }

    // Caso contrário, gerar URL através do Storage.
    if (photo.storage_path) {
      const { data } = db.storage
        .from(BUCKET)
        .getPublicUrl(photo.storage_path);

      if (data?.publicUrl) {
        return data.publicUrl;
      }
    }

    return null;
  }

  // =========================================
  // CARREGAR FOTOGRAFIAS
  // =========================================

  async function loadPhotos() {
    if (!activeEventId || loading) return;

    loading = true;

    try {
      const data = await submissionsAPI.loadSubmissions(activeEventId);

      const previousPhotoId = photos[currentIndex]?.id;

      photos = (data || [])
        .filter((photo) => photo.status === "published")
        .map((photo) => ({
          ...photo,
          image_url: getPhotoUrl(photo)
        }))
        .filter((photo) => photo.image_url);

      if (previousPhotoId) {
        const newIndex = photos.findIndex(
          (photo) => photo.id === previousPhotoId
        );

        currentIndex = newIndex >= 0 ? newIndex : 0;
      } else {
        currentIndex = 0;
      }

      if (photos.length === 0) {
        image.removeAttribute("src");
        participant.textContent = "";
        caption.textContent = "";
        counter.textContent = "0 fotografias";

        showMessage("Ainda não existem fotografias publicadas neste evento.");
        return;
      }

      hideMessage();
      renderPhoto();

      console.log(
        `[SnapQuest Projector] ${photos.length} fotografias carregadas.`
      );

    } catch (error) {
      logError("Erro ao carregar fotografias", error);
      showMessage("Não foi possível carregar as fotografias.");

    } finally {
      loading = false;
    }
  }

  // =========================================
  // APRESENTAR IMAGEM
  // =========================================

  function renderPhoto() {
    if (!photos.length) return;

    const photo = photos[currentIndex];

    if (!photo) return;

    image.classList.add("projector-image-changing");

    const nextImage = new Image();

    nextImage.onload = () => {
      image.src = nextImage.src;
      image.alt = "Fotografia enviada para o SnapQuest";
      image.classList.remove("projector-image-changing");
    };

    nextImage.onerror = async () => {
      console.warn(
        "[SnapQuest Projector] URL público falhou. A tentar URL temporário...",
        photo.storage_path
      );

      // Tentar URL temporário caso o bucket não seja público.
      if (photo.storage_path) {
        try {
          const { data, error } = await db.storage
            .from(BUCKET)
            .createSignedUrl(photo.storage_path, 3600);

          if (error) throw error;

          if (data?.signedUrl) {
            const signedImage = new Image();

            signedImage.onload = () => {
              image.src = signedImage.src;
              image.alt = "Fotografia enviada para o SnapQuest";
              image.classList.remove("projector-image-changing");
            };

            signedImage.onerror = () => {
              image.classList.remove("projector-image-changing");
              showMessage("Não foi possível abrir esta fotografia.");
              logError("Erro ao carregar URL temporário", {
                message: "O navegador não conseguiu carregar a imagem."
              });
            };

            signedImage.src = data.signedUrl;
            return;
          }
        } catch (error) {
          logError("Erro ao gerar URL temporário", error);
        }
      }

      image.classList.remove("projector-image-changing");
      showMessage("Não foi possível apresentar esta fotografia.");
    };

    nextImage.src = photo.image_url;

    const joinedParticipant = Array.isArray(photo.event_participants)
      ? photo.event_participants[0]
      : photo.event_participants;

    participant.textContent =
      joinedParticipant?.name || "Participante";

    caption.textContent = photo.caption || "";

    counter.textContent =
      `${currentIndex + 1} / ${photos.length}`;
  }

  // =========================================
  // ROTAÇÃO AUTOMÁTICA
  // =========================================

  function nextPhoto() {
    if (photos.length <= 1) return;

    currentIndex = (currentIndex + 1) % photos.length;

    renderPhoto();
  }

  function startRotation() {
    stopRotation();

    rotationTimer = setInterval(
      nextPhoto,
      ROTATION_INTERVAL
    );

    refreshTimer = setInterval(
      loadPhotos,
      REFRESH_INTERVAL
    );
  }

  function stopRotation() {
    if (rotationTimer) clearInterval(rotationTimer);
    if (refreshTimer) clearInterval(refreshTimer);

    rotationTimer = null;
    refreshTimer = null;
  }

  // =========================================
  // REALTIME
  // =========================================

  function subscribeToPhotos() {
    if (realtimeChannel) {
      db.removeChannel(realtimeChannel);
      realtimeChannel = null;
    }

    realtimeChannel = db
      .channel(`projector-${activeEventId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "photo_submissions",
          filter: `event_id=eq.${activeEventId}`
        },
        () => loadPhotos()
      )
      .subscribe((status) => {
        console.log("[SnapQuest Projector] Realtime:", status);
      });
  }

  // =========================================
  // INICIAR PROJETOR
  // =========================================

  async function startProjector() {
    const eventId = eventSelect.value;

    if (!eventId) {
      alert("Seleciona primeiro um evento.");
      return;
    }

    projectorSession++;
    activeEventId = eventId;
    currentIndex = 0;

    overlay.hidden = false;
    document.body.classList.add("projector-active");

    showMessage("A carregar fotografias...");

    try {
      if (!document.fullscreenElement) {
        await overlay.requestFullscreen();
      }
    } catch (error) {
      console.warn(
        "[SnapQuest Projector] Ecrã inteiro indisponível:",
        error
      );
    }

    await loadPhotos();

    if (!activeEventId) return;

    subscribeToPhotos();
    startRotation();
  }

  // =========================================
  // FECHAR PROJETOR
  // =========================================

  async function stopProjector() {
    projectorSession++;

    stopRotation();

    if (realtimeChannel) {
      await db.removeChannel(realtimeChannel);
      realtimeChannel = null;
    }

    activeEventId = null;
    photos = [];
    currentIndex = 0;

    overlay.hidden = true;
    document.body.classList.remove("projector-active");

    image.removeAttribute("src");

    if (document.fullscreenElement) {
      try {
        await document.exitFullscreen();
      } catch (error) {
        console.warn(
          "[SnapQuest Projector] Erro ao sair do ecrã inteiro:",
          error
        );
      }
    }
  }

  // =========================================
  // EVENTOS
  // =========================================

  startButton.addEventListener("click", startProjector);

  closeButton.addEventListener("click", stopProjector);

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !overlay.hidden) {
      stopProjector();
    }
  });

  document.addEventListener("fullscreenchange", () => {
    if (!document.fullscreenElement && !overlay.hidden) {
      stopProjector();
    }
  });

  // =========================================
  // INICIALIZAÇÃO
  // =========================================

  loadEvents();

  console.log("[SnapQuest] Modo Projetor carregado.");

})();
