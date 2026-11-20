
/* =========================================
   SNAPQUEST — PARTICIPANTS.JS
   Gestão de participantes e entrada em eventos
========================================= */

(() => {
    "use strict";

    const supabase = () => window.SnapQuestSupabase?.client;

    let currentEvent = null;
    let currentParticipant = null;
    let participants = [];
    let loading = false;

    // ---------- EVENTOS INTERNOS ----------

    function emit(name, detail = {}) {
        document.dispatchEvent(
            new CustomEvent(`snapquest:${name}`, {
                detail
            })
        );
    }

    function showMessage(message, type = "info") {
        if (typeof window.showToast === "function") {
            window.showToast(message, type);
            return;
        }

        console.log(`[SnapQuest ${type}] ${message}`);
    }

    // ---------- VALIDAÇÃO ----------

    function normalizeName(name) {
        return String(name || "")
            .trim()
            .replace(/\s+/g, " ");
    }

    function validateName(name) {
        const normalized = normalizeName(name);

        if (normalized.length < 2) {
            throw new Error("O nome deve ter pelo menos 2 caracteres.");
        }

        if (normalized.length > 30) {
            throw new Error("O nome não pode ultrapassar 30 caracteres.");
        }

        return normalized;
    }

    function normalizePublicCode(code) {
        const value = String(code || "").trim();

        if (!value) {
            throw new Error("Introduz o código do evento.");
        }

        if (!/^\d+$/.test(value)) {
            throw new Error("O código do evento deve conter apenas números.");
        }

        return value.padStart(6, "0");
    }

    // ---------- SESSÃO ANÓNIMA ----------

    async function ensureAnonymousSession() {
        const client = supabase();

        if (!client) {
            throw new Error("O Supabase não está inicializado.");
        }

        const { data: sessionData, error: sessionError } =
            await client.auth.getSession();

        if (sessionError) throw sessionError;

        if (sessionData.session) {
            return sessionData.session;
        }

        const { data, error } =
            await client.auth.signInAnonymously();

        if (error) throw error;

        if (!data.session) {
            throw new Error(
                "Não foi possível iniciar a sessão do participante."
            );
        }

        return data.session;
    }

    // ---------- EVENTO ATUAL ----------

    function setCurrentEvent(event) {
        currentEvent = event || null;
        currentParticipant = null;
        participants = [];

        emit("event-changed", {
            event: currentEvent
        });
    }

    function getCurrentEvent() {
        return currentEvent;
    }

    async function loadEventByPublicId(code) {
        try {
            const normalizedCode = normalizePublicCode(code);
            const api = window.SnapQuestSupabase;

            if (!api?.Events?.getByPublicId) {
                throw new Error("A ligação ao Supabase não está disponível.");
            }

            const result = await api.Events.getByPublicId(normalizedCode);

            if (!result.success) {
                throw new Error(
                    result.message || "Não foi possível encontrar o evento."
                );
            }

            setCurrentEvent(result.data);

            const participant = await restoreParticipant();

            return {
                success: true,
                event: result.data,
                participant
            };
        } catch (error) {
            console.error("[SnapQuest Participants]", error);

            return {
                success: false,
                error,
                message: error.message
            };
        }
    }

    // ---------- PARTICIPANTE ATUAL ----------

    function setCurrentParticipant(participant) {
        currentParticipant = participant || null;

        if (currentParticipant && currentEvent) {
            connectParticipantModules();
        }

        emit("participant-ready", {
            participant: currentParticipant,
            event: currentEvent
        });
    }

    function getCurrentParticipant() {
        return currentParticipant;
    }

    function connectParticipantModules() {
        if (!currentParticipant || !currentEvent) return;

        const participantId = currentParticipant.id;
        const eventId = currentEvent.id;

        window.SnapQuestGallery?.setCurrentParticipant?.(participantId);

        window.SnapQuestRanking?.setCurrentParticipant?.(participantId);

        window.SnapQuestSubmissions?.setContext?.({
            eventId,
            participantId
        });
    }

    // ---------- ENTRAR NO EVENTO ----------

    async function joinEvent(name, avatar = null) {
        if (loading) {
            throw new Error("A entrada no evento já está a ser processada.");
        }

        if (!currentEvent?.id) {
            throw new Error("Não existe nenhum evento selecionado.");
        }

        loading = true;

        try {
            const normalizedName = validateName(name);

            await ensureAnonymousSession();

            const client = supabase();

            const { data, error } = await client.rpc("join_event", {
                p_event_id: currentEvent.id,
                p_name: normalizedName,
                p_avatar: avatar
            });

            if (error) throw error;

            let participant = data;

            if (typeof participant === "string") {
                try {
                    participant = JSON.parse(participant);
                } catch {
                    throw new Error("Resposta inválida ao entrar no evento.");
                }
            }

            if (Array.isArray(participant)) {
                participant = participant[0];
            }

            if (participant?.participant) {
                participant = participant.participant;
            }

            if (!participant?.id) {
                throw new Error(
                    "O Supabase não devolveu os dados do participante."
                );
            }

            currentParticipant = participant;

            connectParticipantModules();

            emit("participant-ready", {
                participant,
                event: currentEvent
            });

            showMessage("Entraste no evento com sucesso!", "success");

            return participant;
        } finally {
            loading = false;
        }
    }

    // ---------- RECUPERAR PARTICIPANTE ----------

    async function restoreParticipant() {
        if (!currentEvent?.id) return null;

        const client = supabase();

        const { data: sessionData, error: sessionError } =
            await client.auth.getSession();

        if (sessionError) throw sessionError;

        const session = sessionData.session;

        if (!session?.user?.id) {
            currentParticipant = null;

            emit("participant-required", {
                event: currentEvent
            });

            return null;
        }

        const { data, error } = await client
            .from("event_participants")
            .select("*")
            .eq("event_id", currentEvent.id)
            .eq("auth_user_id", session.user.id)
            .maybeSingle();

        if (error) throw error;

        if (!data) {
            currentParticipant = null;

            emit("participant-required", {
                event: currentEvent
            });

            return null;
        }

        currentParticipant = data;

        connectParticipantModules();

        emit("participant-ready", {
            participant: data,
            event: currentEvent
        });

        return data;
    }

    // ---------- PERFIL ----------

    async function updateProfile(updates) {
        if (!currentParticipant?.id) {
            throw new Error("Não existe um participante selecionado.");
        }

        const allowedFields = {};

        if (updates.name !== undefined) {
            allowedFields.name = validateName(updates.name);
        }

        if (updates.avatar !== undefined) {
            allowedFields.avatar = updates.avatar;
        }

        const { data, error } = await supabase()
            .from("event_participants")
            .update(allowedFields)
            .eq("id", currentParticipant.id)
            .select()
            .single();

        if (error) throw error;

        currentParticipant = data;

        emit("participant-updated", {
            participant: data
        });

        return data;
    }

    // ---------- LISTA DE PARTICIPANTES ----------

    async function loadParticipants() {
        if (!currentEvent?.id) {
            throw new Error("Não existe nenhum evento selecionado.");
        }

        const { data, error } = await supabase()
            .from("event_participants")
            .select("*")
            .eq("event_id", currentEvent.id)
            .order("created_at", { ascending: true });

        if (error) throw error;

        participants = data || [];

        emit("participants-loaded", {
            participants
        });

        return participants;
    }

    function getParticipants() {
        return [...participants];
    }

    function getParticipantById(id) {
        return participants.find(
            participant => String(participant.id) === String(id)
        ) || null;
    }

    function getParticipantCount() {
        return participants.length;
    }

    // ---------- REMOVER PARTICIPANTE ----------

    async function removeParticipant(participantId) {
        const { error } = await supabase().rpc(
            "remove_event_participant",
            {
                p_participant_id: participantId
            }
        );

        if (error) throw error;

        participants = participants.filter(
            participant => participant.id !== participantId
        );

        if (currentParticipant?.id === participantId) {
            currentParticipant = null;
        }

        emit("participants-loaded", {
            participants
        });

        return true;
    }

    // ---------- SAIR DO EVENTO ----------

    async function leaveEvent() {
        currentParticipant = null;
        participants = [];

        emit("participant-left", {
            event: currentEvent
        });
    }

    // ---------- FORMULÁRIO DE ENTRADA ----------

    function bindJoinForm() {
        const form =
            document.querySelector("#participantForm") ||
            document.querySelector("#joinEventForm");

        if (!form || form.dataset.snapquestBound === "true") {
            return;
        }

        form.dataset.snapquestBound = "true";

        form.addEventListener("submit", async event => {
            event.preventDefault();

            const nameInput =
                form.querySelector(
                    '[name="name"], #participantName, #joinName'
                );

            const submitButton =
                form.querySelector('[type="submit"]');

            try {
                if (!nameInput) {
                    throw new Error("Campo de nome não encontrado.");
                }

                if (submitButton) {
                    submitButton.disabled = true;
                }

                await joinEvent(nameInput.value);
            } catch (error) {
                console.error(error);
                showMessage(error.message, "error");
            } finally {
                if (submitButton) {
                    submitButton.disabled = false;
                }
            }
        });
    }

    // ---------- INICIALIZAÇÃO ----------

    async function initialize() {
        const params = new URLSearchParams(window.location.search);

        const publicCode =
            params.get("code") ||
            params.get("id");

        bindJoinForm();

        if (!publicCode) {
            return;
        }

        const result = await loadEventByPublicId(publicCode);

        if (!result.success) {
            emit("event-load-error", {
                message: result.message
            });

            console.error(result.message);
            return;
        }
    }

    // ---------- API GLOBAL ----------

    window.SnapQuestParticipants = Object.freeze({
        setCurrentEvent,
        getCurrentEvent,
        loadEventByPublicId,

        setCurrentParticipant,
        getCurrentParticipant,

        joinEvent,
        restoreParticipant,

        updateProfile,

        loadParticipants,
        getParticipants,
        getParticipantById,
        getParticipantCount,
        removeParticipant,

        leaveEvent,
        bindJoinForm,
        initialize
    });

    document.addEventListener("DOMContentLoaded", initialize);

})();
