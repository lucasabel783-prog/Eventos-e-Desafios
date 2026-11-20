
/* =========================================================
   SNAPQUEST — SUBMISSIONS
   Envio, consulta e eliminação de fotografias
========================================================= */

(() => {
    "use strict";

    const api = window.SnapQuestSupabase;

    if (!api || !api.client) {
        console.error("SnapQuest: Supabase não está inicializado.");
        return;
    }

    const db = api.client;
    const BUCKET = "photos";

    let currentEventId = null;
    let currentParticipant = null;
    let submissions = [];

    // -----------------------------------------------------
    // CONTEXTO
    // -----------------------------------------------------

    function setContext(eventId, participant) {
        currentEventId = eventId;
        currentParticipant = participant;
    }

    function getContext() {
        return {
            eventId: currentEventId,
            participant: currentParticipant
        };
    }

    // -----------------------------------------------------
    // CARREGAR FOTOGRAFIAS
    // -----------------------------------------------------

    async function loadSubmissions(eventId = currentEventId) {
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
                )
            `)
            .eq("event_id", eventId)
            .order("created_at", { ascending: false });

        if (error) {
            console.error("Erro ao carregar fotografias:", error);
            throw error;
        }

        submissions = data || [];

        return submissions;
    }

    function getSubmissions() {
        return [...submissions];
    }

    function getSubmissionById(id) {
        return submissions.find(item => item.id === id) || null;
    }

    // -----------------------------------------------------
    // ENVIAR FOTOGRAFIA
    // -----------------------------------------------------

    async function uploadSubmission({
        file,
        challengeId,
        caption = ""
    }) {
        if (!currentEventId) {
            throw new Error("Nenhum evento selecionado.");
        }

        if (!currentParticipant?.id) {
            throw new Error("Tens de entrar no evento primeiro.");
        }

        if (!file) {
            throw new Error("Seleciona uma fotografia.");
        }

        if (!file.type.startsWith("image/")) {
            throw new Error("O ficheiro tem de ser uma imagem.");
        }

        const maxSize = 10 * 1024 * 1024;

        if (file.size > maxSize) {
            throw new Error("A fotografia não pode ultrapassar 10 MB.");
        }

        if (!challengeId) {
            throw new Error("Seleciona um desafio.");
        }

        const extension = file.name.split(".").pop().toLowerCase();

        const allowedExtensions = ["jpg", "jpeg", "png", "webp"];

        if (!allowedExtensions.includes(extension)) {
            throw new Error("Formato não suportado. Usa JPG, PNG ou WEBP.");
        }

        const filePath =
            `${currentEventId}/${currentParticipant.id}/${crypto.randomUUID()}.${extension}`;

        // Upload para o Storage
        const { error: uploadError } = await db.storage
            .from(BUCKET)
            .upload(filePath, file, {
                cacheControl: "3600",
                upsert: false,
                contentType: file.type
            });

        if (uploadError) {
            console.error("Erro no upload:", uploadError);
            throw uploadError;
        }

        // Obter URL pública
        const { data: publicUrlData } = db.storage
            .from(BUCKET)
            .getPublicUrl(filePath);

        const imageUrl = publicUrlData.publicUrl;

        // Guardar submissão na base de dados
        const { data, error } = await db
            .from("photo_submissions")
            .insert({
                event_id: currentEventId,
                participant_id: currentParticipant.id,
                challenge_id: challengeId,
                storage_path: filePath,
                image_url: imageUrl,
                caption: caption.trim(),
                status: "published"
            })
            .select()
            .single();

        if (error) {
            // Evitar ficheiros órfãos no Storage
            await db.storage.from(BUCKET).remove([filePath]);

            console.error("Erro ao guardar fotografia:", error);
            throw error;
        }

        submissions.unshift(data);

        return data;
    }

    // -----------------------------------------------------
    // ELIMINAR FOTOGRAFIA
    // -----------------------------------------------------

    async function deleteSubmission(id) {
        const submission = getSubmissionById(id);

        const { error } = await db.rpc("delete_photo_submission", {
            p_submission_id: id
        });

        if (error) {
            console.error("Erro ao eliminar fotografia:", error);
            throw error;
        }

        if (submission?.storage_path) {
            const { error: storageError } = await db.storage
                .from(BUCKET)
                .remove([submission.storage_path]);

            if (storageError) {
                console.warn(
                    "A fotografia foi eliminada da base de dados, mas não do Storage:",
                    storageError
                );
            }
        }

        submissions = submissions.filter(item => item.id !== id);

        return true;
    }

    // -----------------------------------------------------
    // FOTOGRAFIAS POR DESAFIO
    // -----------------------------------------------------

    function getByChallenge(challengeId) {
        return submissions.filter(
            item => item.challenge_id === challengeId
        );
    }

    // -----------------------------------------------------
    // FOTOGRAFIAS POR PARTICIPANTE
    // -----------------------------------------------------

    function getByParticipant(participantId) {
        return submissions.filter(
            item => item.participant_id === participantId
        );
    }

    // -----------------------------------------------------
    // ESTATÍSTICAS
    // -----------------------------------------------------

    function getStatistics() {
        return {
            total: submissions.length,
            participants: new Set(
                submissions.map(item => item.participant_id)
            ).size,
            challenges: new Set(
                submissions.map(item => item.challenge_id)
            ).size
        };
    }

    // -----------------------------------------------------
    // EXPORTAR API
    // -----------------------------------------------------

    window.SnapQuestSubmissions = {
        setContext,
        getContext,

        loadSubmissions,
        getSubmissions,
        getSubmissionById,

        uploadSubmission,
        deleteSubmission,

        getByChallenge,
        getByParticipant,
        getStatistics
    };

})();
