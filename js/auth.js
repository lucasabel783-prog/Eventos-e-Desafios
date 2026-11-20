
/* =========================================
   SNAPQUEST — AUTH.JS
   Autenticação real de organizadores
========================================= */

(() => {
    "use strict";

    const getSupabase = () => window.SnapQuestSupabase;

    function showMessage(message, type = "error") {
        let element = document.querySelector(".auth-message");

        if (!element) {
            element = document.createElement("div");
            element.className = "auth-message";

            const form = document.querySelector("#loginForm, #registerForm");

            if (form) {
                form.prepend(element);
            } else {
                return;
            }
        }

        element.textContent = message;
        element.dataset.type = type;
        element.style.display = "block";
    }

    function setLoading(form, loading) {
        if (!form) return;

        const button = form.querySelector(
            'button[type="submit"], button:not([type])'
        );

        if (!button) return;

        if (loading) {
            button.dataset.originalText = button.textContent;
            button.textContent = "A processar...";
            button.disabled = true;
        } else {
            button.textContent =
                button.dataset.originalText || "Continuar";
            button.disabled = false;
        }
    }

    function getInput(form, selectors) {
        for (const selector of selectors) {
            const element = form.querySelector(selector);
            if (element) return element.value.trim();
        }

        return "";
    }

    function validateCredentials(email, password) {
        if (!email || !password) {
            showMessage("Preenche todos os campos.");
            return false;
        }

        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            showMessage("Introduz um endereço de email válido.");
            return false;
        }

        if (password.length < 6) {
            showMessage("A palavra-passe deve ter pelo menos 6 caracteres.");
            return false;
        }

        return true;
    }

    // ---------- LOGIN ----------

    async function loginOrganizer(event) {
        event?.preventDefault();

        const form = document.querySelector("#loginForm");

        if (!form) return;

        const email = getInput(form, [
            '[name="email"]',
            "#loginEmail",
            "#email",
            'input[type="email"]'
        ]);

        const password = getInput(form, [
            '[name="password"]',
            "#loginPassword",
            "#password",
            'input[type="password"]'
        ]);

        if (!validateCredentials(email, password)) return;

        const supabase = getSupabase();

        if (!supabase) {
            showMessage("A ligação ao Supabase não está configurada.");
            return;
        }

        setLoading(form, true);

        try {
            const result = await supabase.Auth.login(email, password);

            if (!result.success) {
                throw result.error;
            }

            showMessage("Sessão iniciada com sucesso!", "success");

            window.location.href = "organizer.html";

        } catch (error) {
            console.error(error);

            showMessage(
                error.message === "Invalid login credentials"
                    ? "Email ou palavra-passe incorretos."
                    : error.message || "Não foi possível iniciar sessão."
            );
        } finally {
            setLoading(form, false);
        }
    }

    // ---------- REGISTO ----------

    
async function registerOrganizer(event) {
    event?.preventDefault();

    const form = document.querySelector("#registerForm");
    if (!form) return;

    const name = getInput(form, [
        '[name="name"]',
        '[name="full_name"]',
        "#registerName",
        "#name"
    ]);

    const email = getInput(form, [
        '[name="email"]',
        "#registerEmail",
        "#email",
        'input[type="email"]'
    ]);

    const password = getInput(form, [
        '[name="password"]',
        "#registerPassword",
        "#password",
        'input[type="password"]'
    ]);

    const confirmPassword = getInput(form, [
        '[name="confirmPassword"]',
        '[name="confirm_password"]',
        "#confirmPassword"
    ]);

    if (!name || name.length < 2) {
        showMessage("Introduz o teu nome.");
        return;
    }

    if (!validateCredentials(email, password)) return;

    if (confirmPassword && password !== confirmPassword) {
        showMessage("As palavras-passe não coincidem.");
        return;
    }

    const supabase = getSupabase();

    if (!supabase?.client) {
        showMessage("A ligação ao Supabase não está configurada.");
        return;
    }

    setLoading(form, true);

    try {
        const { data, error } = await supabase.client.auth.signUp({
            email,
            password,
            options: {
                data: {
                    full_name: name
                },
                emailRedirectTo: `${window.location.origin}/index.html`
            }
        });

        if (error) throw error;

        if (data.session) {
            showMessage("Conta criada com sucesso!", "success");
            window.location.href = "organizer.html";
        } else {
            showMessage(
                "Conta criada! Confirma o teu email. Depois poderás iniciar sessão.",
                "success"
            );
        }

    } catch (error) {
        console.error("[SnapQuest Auth]", error);
        showMessage(error.message || "Não foi possível criar a conta.");
    } finally {
        setLoading(form, false);
    }
}


    // ---------- RECUPERAR PALAVRA-PASSE ----------

    async function recoverOrganizerPassword(event) {
        event?.preventDefault();

        const emailInput = document.querySelector(
            '#loginForm [name="email"], #loginEmail, #email'
        );

        const email = emailInput?.value.trim();

        if (!email) {
            showMessage("Introduz primeiro o teu email.");
            return;
        }

        const supabase = getSupabase();

        if (!supabase) {
            showMessage("Supabase não está configurado.");
            return;
        }

        try {
            const result = await supabase.Auth.recoverPassword(email);

            if (!result.success) {
                throw result.error;
            }

            showMessage(
                "Se a conta existir, receberás um email de recuperação.",
                "success"
            );

        } catch (error) {
            console.error(error);
            showMessage(error.message || "Erro ao enviar email.");
        }
    }

    // ---------- LOGOUT ----------

    async function logoutOrganizer() {
        const supabase = getSupabase();

        if (!supabase) return;

        const result = await supabase.Auth.logout();

        if (!result.success) {
            showMessage("Não foi possível terminar a sessão.");
            return;
        }

        window.location.href = "organizer.html";
    }

    // ---------- PROTEGER PAINEL ----------

    
    async function checkOrganizerSession() {
        const authScreen = document.querySelector("#authScreen");
        const dashboardLayout = document.querySelector("#dashboardLayout");

        try {
            const result = await window.SnapQuestSupabase.Auth.getSession();

            if (!result?.success) {
                throw result?.error || new Error("Não foi possível verificar a sessão.");
            }

            // Auth.getSession() devolve diretamente a sessão em result.data.
            const session = result.data;

            if (!session) {
                if (authScreen) authScreen.hidden = false;
                if (dashboardLayout) dashboardLayout.hidden = true;
                console.info("SnapQuest: sessão não iniciada.");
                return false;
            }

            if (authScreen) authScreen.hidden = true;
            if (dashboardLayout) dashboardLayout.hidden = false;

            const userName =
                session.user?.user_metadata?.full_name ||
                session.user?.email?.split("@")[0] ||
                "Organizador";

            const userNameElement = document.querySelector(
                "#sidebarUserName, .sidebar-user-info strong"
            );
            const userEmailElement = document.querySelector(
                "#sidebarUserEmail, .sidebar-user-info span"
            );
            const avatarElement = document.querySelector(
                "#sidebarAvatar, .sidebar-avatar"
            );

            if (userNameElement) userNameElement.textContent = userName;
            if (userEmailElement) userEmailElement.textContent = session.user?.email || "";
            if (avatarElement) {
                avatarElement.textContent = userName.slice(0, 1).toUpperCase();
            }

            if (window.SnapQuestEvents?.loadEvents) {
                await window.SnapQuestEvents.loadEvents();
                const container =
                    document.querySelector("#allEvents") ||
                    document.querySelector("#eventsList");
                window.SnapQuestEvents.renderEvents(container);
                window.SnapQuestEvents.renderEvents(
                    document.querySelector("#recentEvents")
                );
            }

            return true;

        } catch (error) {
            console.error("Erro ao verificar sessão:", error);
            if (authScreen) authScreen.hidden = false;
            if (dashboardLayout) dashboardLayout.hidden = true;
            return false;
        }
    }


    // ---------- INICIALIZAÇÃO ----------

    document.addEventListener("DOMContentLoaded", () => {
        const loginForm = document.querySelector("#loginForm");
        const registerForm = document.querySelector("#registerForm");

        loginForm?.addEventListener("submit", loginOrganizer);
        registerForm?.addEventListener("submit", registerOrganizer);

        document.querySelector("#logoutButton")?.addEventListener(
            "click",
            logoutOrganizer
        );

        checkOrganizerSession();
    });

    // API GLOBAL

    window.loginOrganizer = loginOrganizer;
    window.registerOrganizer = registerOrganizer;
    window.logoutOrganizer = logoutOrganizer;
    window.recoverOrganizerPassword = recoverOrganizerPassword;

})();
