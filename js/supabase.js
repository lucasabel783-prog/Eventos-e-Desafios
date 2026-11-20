
/* =========================================
   SNAPQUEST — SUPABASE.JS
   Ligação central ao Supabase
========================================= */

const SUPABASE_URL = "https://aewrjvzggbuckudsfwzr.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_CacJPqs4BsX0WbWmuPSjcA_lfvrRTtZ";

if (!window.supabase) {
    throw new Error(
        "Biblioteca Supabase não encontrada. Verifica o script CDN no HTML."
    );
}

const supabaseClient = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    {
        auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true
        },
        realtime: {
            params: {
                eventsPerSecond: 10
            }
        }
    }
);

// ---------- UTILITÁRIOS ----------

function snapquestError(error) {
    console.error("[SnapQuest Supabase]", error);

    return {
        success: false,
        message: error?.message || "Ocorreu um erro inesperado.",
        error
    };
}

function snapquestSuccess(data = null) {
    return {
        success: true,
        data
    };
}

// ---------- AUTENTICAÇÃO ----------

const Auth = {
    async register(email, password, name) {
        try {
            const { data, error } = await supabaseClient.auth.signUp({
                email,
                password,
                options: {
                    data: { full_name: name }
                }
            });

            if (error) throw error;
            return snapquestSuccess(data);
        } catch (error) {
            return snapquestError(error);
        }
    },

    async login(email, password) {
        try {
            const { data, error } =
                await supabaseClient.auth.signInWithPassword({
                    email,
                    password
                });

            if (error) throw error;
            return snapquestSuccess(data);
        } catch (error) {
            return snapquestError(error);
        }
    },

    async logout() {
        try {
            const { error } = await supabaseClient.auth.signOut();
            if (error) throw error;
            return snapquestSuccess();
        } catch (error) {
            return snapquestError(error);
        }
    },

    async getUser() {
        try {
            const { data, error } = await supabaseClient.auth.getUser();
            if (error) throw error;
            return snapquestSuccess(data.user);
        } catch (error) {
            return snapquestError(error);
        }
    },

    async getSession() {
        try {
            const { data, error } = await supabaseClient.auth.getSession();
            if (error) throw error;
            return snapquestSuccess(data.session);
        } catch (error) {
            return snapquestError(error);
        }
    },

    async recoverPassword(email) {
        try {
            const { error } =
                await supabaseClient.auth.resetPasswordForEmail(email, {
                    redirectTo: `${window.location.origin}/organizer.html`
                });

            if (error) throw error;
            return snapquestSuccess();
        } catch (error) {
            return snapquestError(error);
        }
    },

    onAuthChange(callback) {
        return supabaseClient.auth.onAuthStateChange(
            (event, session) => callback(event, session)
        );
    }
};

// ---------- EVENTOS ----------

const Events = {
    async getAll() {
        try {
            const { data, error } = await supabaseClient
                .from("events")
                .select("*")
                .order("created_at", { ascending: false });

            if (error) throw error;
            return snapquestSuccess(data);
        } catch (error) {
            return snapquestError(error);
        }
    },

    async getById(id) {
        try {
            const { data, error } = await supabaseClient
                .from("events")
                .select("*")
                .eq("id", id)
                .single();

            if (error) throw error;
            return snapquestSuccess(data);
        } catch (error) {
            return snapquestError(error);
        }
    },

    // Procura eventos publicados ou rascunhos do próprio organizador.
    async getByPublicId(publicId) {
        try {
            const normalized = String(publicId || "").trim();

            if (!/^\d+$/.test(normalized)) {
                throw new Error("Código do evento inválido.");
            }

            const numericPublicId = Number(normalized);

            // 1. Primeiro, tenta encontrar um evento publicado.
            const { data: publishedEvent, error: publishedError } =
                await supabaseClient
                    .from("events")
                    .select("*")
                    .eq("public_id", numericPublicId)
                    .eq("status", "published")
                    .maybeSingle();

            if (publishedError) throw publishedError;

            if (publishedEvent) {
                return snapquestSuccess(publishedEvent);
            }

            // 2. Se não estiver publicado, verifica se pertence
            // ao utilizador atualmente autenticado.
            const { data: userData, error: userError } =
                await supabaseClient.auth.getUser();

            if (userError) throw userError;

            const user = userData.user;

            if (!user) {
                throw new Error(
                    "Evento não encontrado ou ainda não publicado."
                );
            }

            // 3. Só permite carregar o rascunho se for do organizador.
            const { data: ownEvent, error: ownEventError } =
                await supabaseClient
                    .from("events")
                    .select("*")
                    .eq("public_id", numericPublicId)
                    .eq("created_by", user.id)
                    .maybeSingle();

            if (ownEventError) throw ownEventError;

            if (!ownEvent) {
                throw new Error(
                    "Evento não encontrado ou ainda não publicado."
                );
            }

            return snapquestSuccess(ownEvent);

        } catch (error) {
            return snapquestError(error);
        }
    },

    async create(eventData) {
        try {
            const { data, error } = await supabaseClient
                .from("events")
                .insert(eventData)
                .select()
                .single();

            if (error) throw error;
            return snapquestSuccess(data);
        } catch (error) {
            return snapquestError(error);
        }
    },

    async update(id, updates) {
        try {
            const { data, error } = await supabaseClient
                .from("events")
                .update(updates)
                .eq("id", id)
                .select()
                .single();

            if (error) throw error;
            return snapquestSuccess(data);
        } catch (error) {
            return snapquestError(error);
        }
    },

    async delete(id) {
        try {
            const { error } = await supabaseClient
                .from("events")
                .delete()
                .eq("id", id);

            if (error) throw error;
            return snapquestSuccess();
        } catch (error) {
            return snapquestError(error);
        }
    }
};

// ---------- PARTICIPANTES ----------

const Participants = {
    async getByEvent(eventId) {
        try {
            const { data, error } = await supabaseClient
                .from("event_participants")
                .select("*")
                .eq("event_id", eventId)
                .order("created_at", { ascending: true });

            if (error) throw error;
            return snapquestSuccess(data);
        } catch (error) {
            return snapquestError(error);
        }
    },

    async join(eventId, name, avatar = null) {
        try {
            const { data, error } = await supabaseClient.rpc("join_event", {
                p_event_id: eventId,
                p_name: name,
                p_avatar: avatar
            });

            if (error) throw error;
            return snapquestSuccess(data);
        } catch (error) {
            return snapquestError(error);
        }
    },

    async update(participantId, updates) {
        try {
            const { data, error } = await supabaseClient
                .from("event_participants")
                .update(updates)
                .eq("id", participantId)
                .select()
                .single();

            if (error) throw error;
            return snapquestSuccess(data);
        } catch (error) {
            return snapquestError(error);
        }
    },

    async remove(participantId) {
        try {
            const { error } = await supabaseClient.rpc(
                "remove_event_participant",
                { p_participant_id: participantId }
            );

            if (error) throw error;
            return snapquestSuccess();
        } catch (error) {
            return snapquestError(error);
        }
    }
};

// ---------- DESAFIOS ----------

const Challenges = {
    async getByEvent(eventId) {
        try {
            const { data, error } = await supabaseClient
                .from("challenges")
                .select("*")
                .eq("event_id", eventId)
                .order("position", { ascending: true });

            if (error) throw error;
            return snapquestSuccess(data);
        } catch (error) {
            return snapquestError(error);
        }
    },

    async create(challengeData) {
        try {
            const { data, error } = await supabaseClient
                .from("challenges")
                .insert(challengeData)
                .select()
                .single();

            if (error) throw error;
            return snapquestSuccess(data);
        } catch (error) {
            return snapquestError(error);
        }
    },

    async update(id, updates) {
        try {
            const { data, error } = await supabaseClient
                .from("challenges")
                .update(updates)
                .eq("id", id)
                .select()
                .single();

            if (error) throw error;
            return snapquestSuccess(data);
        } catch (error) {
            return snapquestError(error);
        }
    },

    async delete(id) {
        try {
            const { error } = await supabaseClient
                .from("challenges")
                .delete()
                .eq("id", id);

            if (error) throw error;
            return snapquestSuccess();
        } catch (error) {
            return snapquestError(error);
        }
    },

    async unlock(id) {
        return this.update(id, { status: "available" });
    },

    async end(id) {
        return this.update(id, { status: "ended" });
    }
};

// ---------- SUBMISSÕES ----------

const Submissions = {
    async getByEvent(eventId) {
        try {
            const { data, error } = await supabaseClient
                .from("photo_submissions")
                .select("*")
                .eq("event_id", eventId)
                .eq("status", "published")
                .order("created_at", { ascending: false });

            if (error) throw error;
            return snapquestSuccess(data);
        } catch (error) {
            return snapquestError(error);
        }
    },

    async upload(file, metadata) {
        try {
            const fileId = crypto.randomUUID();
            const extension = file.name.split(".").pop().toLowerCase();

            const filePath =
                `${metadata.event_id}/${metadata.participant_id}/${fileId}.${extension}`;

            const { data: storageData, error: storageError } =
                await supabaseClient.storage
                    .from("photos")
                    .upload(filePath, file, {
                        cacheControl: "3600",
                        upsert: false,
                        contentType: file.type
                    });

            if (storageError) throw storageError;

            const { data, error } = await supabaseClient
                .from("photo_submissions")
                .insert({
                    event_id: metadata.event_id,
                    participant_id: metadata.participant_id,
                    challenge_id: metadata.challenge_id,
                    storage_path: storageData.path,
                    caption: metadata.caption || "",
                    status: "published"
                })
                .select()
                .single();

            if (error) {
                await supabaseClient.storage
                    .from("photos")
                    .remove([storageData.path]);

                throw error;
            }

            return snapquestSuccess(data);
        } catch (error) {
            return snapquestError(error);
        }
    },

    async delete(id) {
        try {
            const { error } = await supabaseClient.rpc(
                "delete_photo_submission",
                { p_submission_id: id }
            );

            if (error) throw error;
            return snapquestSuccess();
        } catch (error) {
            return snapquestError(error);
        }
    }
};

// ---------- LIKES ----------

const Likes = {
    async toggle(photoId, participantId) {
        try {
            const { data, error } = await supabaseClient.rpc(
                "toggle_photo_like",
                {
                    p_photo_id: photoId,
                    p_participant_id: participantId
                }
            );

            if (error) throw error;
            return snapquestSuccess(data);
        } catch (error) {
            return snapquestError(error);
        }
    }
};

// ---------- RANKING ----------

const Ranking = {
    async getByEvent(eventId) {
        try {
            const { data, error } = await supabaseClient.rpc(
                "get_event_ranking",
                { p_event_id: eventId }
            );

            if (error) throw error;
            return snapquestSuccess(data);
        } catch (error) {
            return snapquestError(error);
        }
    }
};

// ---------- REALTIME ----------

const Realtime = {
    subscribeToEvent(eventId, callback) {
        return supabaseClient
            .channel(`snapquest-event-${eventId}`)
            .on(
                "postgres_changes",
                {
                    event: "*",
                    schema: "public",
                    table: "photo_submissions",
                    filter: `event_id=eq.${eventId}`
                },
                payload => callback("photos", payload)
            )
            .on(
                "postgres_changes",
                {
                    event: "*",
                    schema: "public",
                    table: "challenges",
                    filter: `event_id=eq.${eventId}`
                },
                payload => callback("challenges", payload)
            )
            .on(
                "postgres_changes",
                {
                    event: "*",
                    schema: "public",
                    table: "event_participants",
                    filter: `event_id=eq.${eventId}`
                },
                payload => callback("participants", payload)
            )
            .subscribe();
    },

    async unsubscribe(channel) {
        if (channel) {
            await supabaseClient.removeChannel(channel);
        }
    }
};

// ---------- STORAGE ----------

const Storage = {
    async getPublicUrl(bucket, path) {
        const { data } = supabaseClient.storage
            .from(bucket)
            .getPublicUrl(path);

        return data.publicUrl;
    },

    async delete(bucket, paths) {
        try {
            const { data, error } = await supabaseClient.storage
                .from(bucket)
                .remove(Array.isArray(paths) ? paths : [paths]);

            if (error) throw error;
            return snapquestSuccess(data);
        } catch (error) {
            return snapquestError(error);
        }
    }
};

// ---------- API GLOBAL ----------

window.SnapQuestSupabase = Object.freeze({
    client: supabaseClient,
    Auth,
    Events,
    Participants,
    Challenges,
    Submissions,
    Likes,
    Ranking,
    Realtime,
    Storage
});

console.info("[SnapQuest] Módulo Supabase carregado.");
