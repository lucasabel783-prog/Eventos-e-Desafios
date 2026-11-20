
/* =========================================================
   SNAPQUEST — GALLERY
   Galeria de fotografias, filtros e likes
========================================================= */

(() => {
    "use strict";

    const api = window.SnapQuestSupabase;

    if (!api || !api.client) {
        console.error("SnapQuest: Supabase não está inicializado.");
        return;
    }

    const db = api.client;

    let currentEventId = null;
    let currentParticipant = null;
    let photos = [];
    let currentFilter = "all";

    // -----------------------------------------------------
    // CONTEXTO
    // -----------------------------------------------------

    function setCurrentEvent(eventId) {
        currentEventId = eventId;
    }

    function setCurrentParticipant(participant) {
        currentParticipant = participant;
    }

    // -----------------------------------------------------
    // CARREGAR GALERIA
    // -----------------------------------------------------

    async function loadGallery(eventId = currentEventId) {
        if (!eventId) {
            throw new Error("Nenhum evento selecionado.");
        }

        const { data, error } = await db
            .from("photo_submissions")
            .select(`
                *,
                event_participants (
                    id,
                    name,
                    avatar_url
                ),
                challenges (
                    id,
                    title
                ),
                photo_likes (
                    id,
                    participant_id
                )
            `)
            .eq("event_id", eventId)
            .eq("status", "published")
            .order("created_at", { ascending: false });

        if (error) {
            console.error("Erro ao carregar galeria:", error);
            throw error;
        }

        photos = data || [];

        return getFilteredPhotos();
    }

    function getPhotos() {
        return [...photos];
    }

    function getPhotoById(id) {
        return photos.find(photo => photo.id === id) || null;
    }

    // -----------------------------------------------------
    // FILTROS
    // -----------------------------------------------------

    function setFilter(filter) {
        currentFilter = filter || "all";
        return getFilteredPhotos();
    }

    function getFilteredPhotos() {
        if (currentFilter === "all") {
            return [...photos];
        }

        if (currentFilter === "mine") {
            return photos.filter(
                photo => photo.participant_id === currentParticipant?.id
            );
        }

        if (currentFilter.startsWith("challenge:")) {
            const challengeId = currentFilter.split(":")[1];

            return photos.filter(
                photo => photo.challenge_id === challengeId
            );
        }

        if (currentFilter.startsWith("participant:")) {
            const participantId = currentFilter.split(":")[1];

            return photos.filter(
                photo => photo.participant_id === participantId
            );
        }

        return [...photos];
    }

    // -----------------------------------------------------
    // LIKES
    // -----------------------------------------------------

    async function toggleLike(photoId) {
        if (!currentParticipant?.id) {
            throw new Error("Entra no evento para gostar de fotografias.");
        }

        const { data, error } = await db.rpc("toggle_photo_like", {
            p_photo_id: photoId,
            p_participant_id: currentParticipant.id
        });

        if (error) {
            console.error("Erro ao registar like:", error);
            throw error;
        }

        // Atualizar galeria local
        await loadGallery();

        return data;
    }

    function hasLiked(photo) {
        if (!currentParticipant?.id) return false;

        return (photo.photo_likes || []).some(
            like => like.participant_id === currentParticipant.id
        );
    }

    function getLikeCount(photo) {
        return photo?.photo_likes?.length || 0;
    }

    // -----------------------------------------------------
    // ATUALIZAR GALERIA
    // -----------------------------------------------------

    function addPhoto(photo) {
        if (!photo || photos.some(item => item.id === photo.id)) {
            return;
        }

        photos.unshift(photo);
    }

    function removePhoto(photoId) {
        photos = photos.filter(photo => photo.id !== photoId);
    }

    // -----------------------------------------------------
    // ESTATÍSTICAS
    // -----------------------------------------------------

    function getStatistics() {
        return {
            totalPhotos: photos.length,
            totalLikes: photos.reduce(
                (total, photo) => total + getLikeCount(photo),
                0
            ),
            totalParticipants: new Set(
                photos.map(photo => photo.participant_id)
            ).size
        };
    }

    // -----------------------------------------------------
    // EXPORTAR API
    // -----------------------------------------------------

    window.SnapQuestGallery = {
        setCurrentEvent,
        setCurrentParticipant,

        loadGallery,
        getPhotos,
        getPhotoById,

        setFilter,
        getFilteredPhotos,

        toggleLike,
        hasLiked,
        getLikeCount,

        addPhoto,
        removePhoto,

        getStatistics
    };

})();
