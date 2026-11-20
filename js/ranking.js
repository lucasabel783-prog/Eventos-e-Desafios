
/* =========================================================
   SNAPQUEST — RANKING
   Classificação dos participantes de cada evento
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
    let ranking = [];

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
    // CARREGAR RANKING
    // -----------------------------------------------------

    async function loadRanking(eventId = currentEventId) {
        if (!eventId) {
            throw new Error("Nenhum evento selecionado.");
        }

        const { data, error } = await db.rpc("get_event_ranking", {
            p_event_id: eventId
        });

        if (error) {
            console.error("Erro ao carregar ranking:", error);
            throw error;
        }

        ranking = (data || []).map((player, index) => ({
            ...player,
            rank: index + 1
        }));

        return ranking;
    }

    function getRanking() {
        return [...ranking];
    }

    // -----------------------------------------------------
    // PARTICIPANTE
    // -----------------------------------------------------

    function getParticipantPosition(participantId) {
        const player = ranking.find(
            item => item.participant_id === participantId
        );

        return player ? player.rank : null;
    }

    function getCurrentParticipantPosition() {
        if (!currentParticipant?.id) return null;

        return getParticipantPosition(currentParticipant.id);
    }

    function getParticipantPoints(participantId) {
        const player = ranking.find(
            item => item.participant_id === participantId
        );

        return player?.points || 0;
    }

    // -----------------------------------------------------
    // TOP PARTICIPANTES
    // -----------------------------------------------------

    function getTopPlayers(limit = 3) {
        return ranking.slice(0, limit);
    }

    function getWinner() {
        return ranking.length ? ranking[0] : null;
    }

    // -----------------------------------------------------
    // ESTATÍSTICAS
    // -----------------------------------------------------

    function getStatistics() {
        return {
            totalParticipants: ranking.length,
            totalPoints: ranking.reduce(
                (total, player) => total + (player.points || 0),
                0
            ),
            totalCompletedChallenges: ranking.reduce(
                (total, player) =>
                    total + (player.completed_challenges || 0),
                0
            )
        };
    }

    // -----------------------------------------------------
    // EXPORTAR API
    // -----------------------------------------------------

    window.SnapQuestRanking = {
        setCurrentEvent,
        setCurrentParticipant,

        loadRanking,
        getRanking,

        getParticipantPosition,
        getCurrentParticipantPosition,
        getParticipantPoints,

        getTopPlayers,
        getWinner,

        getStatistics
    };

})();
