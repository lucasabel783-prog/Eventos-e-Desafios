
/* =========================================================
   SNAPQUEST — CHALLENGES
   Gestão de desafios fotográficos
========================================================= */

(() => {
    "use strict";

    const api = window.SnapQuestSupabase;

    if (!api || !api.client) {
        console.error("SnapQuest: Supabase não está inicializado.");
        return;
    }

    const db = api.client;

    const ChallengeStatus = {
        LOCKED: "locked",
        ACTIVE: "available",
        COMPLETED: "ended",
        ENDED: "ended"
    };

    let currentEventId = null;
    let challenges = [];

    // -----------------------------------------------------
    // EVENTO ATUAL
    // -----------------------------------------------------

    function setCurrentEvent(eventId) {
        currentEventId = eventId;
        challenges = [];
    }

    function getCurrentEventId() {
        return currentEventId;
    }

    // -----------------------------------------------------
    // CARREGAR DESAFIOS
    // -----------------------------------------------------

    async function loadChallenges(eventId = currentEventId) {
        if (!eventId) {
            throw new Error("Nenhum evento selecionado.");
        }

        const { data, error } = await db
            .from("challenges")
            .select("*")
            .eq("event_id", eventId)
            .order("position", { ascending: true });

        if (error) {
            console.error("Erro ao carregar desafios:", error);
            throw error;
        }

        challenges = data || [];

        return challenges;
    }

    // -----------------------------------------------------
    // CRIAR DESAFIO
    // -----------------------------------------------------

    async function createChallenge(data) {
        if (!currentEventId && !data.event_id) {
            throw new Error("Nenhum evento selecionado.");
        }

        const title = String(data.title || "").trim();

        if (!title) {
            throw new Error("O título do desafio é obrigatório.");
        }

        const eventId = data.event_id || currentEventId;

        const position = challenges.length
            ? Math.max(...challenges.map(item =>
                Number(item.position || 0)
            )) + 1
            : 0;

        const status = data.status === "available"
            ? "available"
            : "locked";

        const newChallenge = {
            event_id: eventId,
            batch_id: data.batch_id || null,
            title,
            description: data.description || null,
            image_url: data.image_url || null,
            position,
            status,
            submission_count: 0
        };

        const { data: created, error } = await db
            .from("challenges")
            .insert(newChallenge)
            .select()
            .single();

        if (error) {
            console.error("Erro ao criar desafio:", error);
            throw error;
        }

        challenges.push(created);

        return created;
    }

    // -----------------------------------------------------
    // EDITAR DESAFIO
    // -----------------------------------------------------

    async function updateChallenge(challengeId, updates) {
        const allowedFields = [
            "title",
            "description",
            "image_url",
            "position",
            "status",
            "batch_id",
            "unlocked_at",
            "ended_at"
        ];

        const cleanUpdates = {};

        for (const field of allowedFields) {
            if (Object.prototype.hasOwnProperty.call(updates, field)) {
                cleanUpdates[field] = updates[field];
            }
        }

        if (cleanUpdates.title !== undefined) {
            cleanUpdates.title = String(cleanUpdates.title).trim();

            if (!cleanUpdates.title) {
                throw new Error("O título não pode estar vazio.");
            }
        }

        if (cleanUpdates.status !== undefined) {
            const validStatuses = ["locked", "available", "ended"];

            if (!validStatuses.includes(cleanUpdates.status)) {
                throw new Error("Estado de desafio inválido.");
            }
        }

        const { data, error } = await db
            .from("challenges")
            .update(cleanUpdates)
            .eq("id", challengeId)
            .eq("event_id", currentEventId)
            .select()
            .single();

        if (error) {
            console.error("Erro ao atualizar desafio:", error);
            throw error;
        }

        challenges = challenges.map(challenge =>
            challenge.id === challengeId ? data : challenge
        );

        return data;
    }

    // -----------------------------------------------------
    // ELIMINAR DESAFIO
    // -----------------------------------------------------

    async function deleteChallenge(challengeId) {
        const { error } = await db
            .from("challenges")
            .delete()
            .eq("id", challengeId)
            .eq("event_id", currentEventId);

        if (error) {
            console.error("Erro ao eliminar desafio:", error);
            throw error;
        }

        challenges = challenges.filter(
            challenge => challenge.id !== challengeId
        );

        return true;
    }

    // -----------------------------------------------------
    // DESBLOQUEAR DESAFIO
    // -----------------------------------------------------

    async function unlockChallenge(challengeId) {
        return updateChallenge(challengeId, {
            status: ChallengeStatus.ACTIVE,
            unlocked_at: new Date().toISOString(),
            ended_at: null
        });
    }

    // -----------------------------------------------------
    // TERMINAR DESAFIO
    // -----------------------------------------------------

    async function endChallenge(challengeId) {
        return updateChallenge(challengeId, {
            status: ChallengeStatus.ENDED,
            ended_at: new Date().toISOString()
        });
    }

    // -----------------------------------------------------
    // ORDENAR DESAFIOS
    // -----------------------------------------------------

    async function reorderChallenges(orderedIds) {
        for (let index = 0; index < orderedIds.length; index++) {
            await updateChallenge(orderedIds[index], {
                position: index
            });
        }

        return loadChallenges();
    }

    // -----------------------------------------------------
    // CONSULTAS
    // -----------------------------------------------------

    function getChallenges() {
        return challenges;
    }

    function getChallengeById(id) {
        return challenges.find(challenge => challenge.id === id) || null;
    }

    function getChallengeStatistics() {
        return {
            total: challenges.length,
            locked: challenges.filter(
                item => item.status === "locked"
            ).length,
            active: challenges.filter(
                item => item.status === "available"
            ).length,
            ended: challenges.filter(
                item => item.status === "ended"
            ).length,
            submissions: challenges.reduce(
                (total, item) =>
                    total + Number(item.submission_count || 0),
                0
            )
        };
    }

    // -----------------------------------------------------
    // EXPORTAR
    // -----------------------------------------------------

    window.SnapQuestChallenges = {
        ChallengeStatus,
        setCurrentEvent,
        getCurrentEventId,
        loadChallenges,
        createChallenge,
        updateChallenge,
        deleteChallenge,
        unlockChallenge,
        endChallenge,
        reorderChallenges,
        getChallenges,
        getChallengeById,
        getChallengeStatistics
    };

})();
