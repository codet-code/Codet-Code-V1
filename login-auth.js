import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

    // These are safe to expose in a browser application.
    // NEVER put a Supabase service_role/secret key here.
    const SUPABASE_URL = "https://cuuzbgizggjmlezmysde.supabase.co";
    const SUPABASE_ANON_KEY = "sb_publishable_8KSO1mR8gJnem_SG1O6oUw_m3tq-MIv";

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    const $ = (id) => document.getElementById(id);

    const authZone = $("auth-zone");
    const userDashboard = $("user-dashboard");
    const adminDashboard = $("admin-dashboard");
    const statusBox = $("status-msg");
    const announcementBar = $("announcement-bar");
    const announcementText = $("announcement-text");

    function updateStatus(message, isError = true) {
      statusBox.textContent = `[SYSTEM REPORT]: ${message}`;
      statusBox.style.color = isError ? "#ff8888" : "#88ff88";
    }

    function setLoading(button, loading) {
      button.disabled = loading;
      button.dataset.originalText ??= button.textContent;
      button.textContent = loading ? "Please wait..." : button.dataset.originalText;
    }

    function clearAuthInputs() {
      $("email").value = "";
      $("password").value = "";
    }

    function showAnnouncement(message) {
      const text = typeof message === "string" ? message.trim() : "";

      if (!text) {
        announcementText.textContent = "";
        announcementBar.style.display = "none";
        return;
      }

      announcementText.textContent = text;
      announcementBar.style.display = "block";
    }

    function hideAllDashboards() {
      authZone.classList.add("hidden");
      userDashboard.classList.add("hidden");
      adminDashboard.classList.add("hidden");
    }

    function showLoggedOut() {
      hideAllDashboards();
      authZone.classList.remove("hidden");
    }

    function showUser(user) {
      hideAllDashboards();
      $("user-email-display").textContent = user.email ?? "Member";
      userDashboard.classList.remove("hidden");
    }

    function showAdmin(user) {
      hideAllDashboards();
      $("admin-email-display").textContent = user.email ?? "Admin";
      adminDashboard.classList.remove("hidden");
    }

    async function isCurrentUserAdmin() {
      const { data, error } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", (await supabase.auth.getUser()).data.user?.id)
        .maybeSingle();

      if (error) {
        console.error("Role lookup failed:", error);
        return false;
      }

      return data?.role === "admin";
    }

    async function routeUser(user) {
      if (!user) {
        showLoggedOut();
        return;
      }

      const admin = await isCurrentUserAdmin();

      if (admin) {
        showAdmin(user);
        updateStatus(`Administrator session active for ${user.email}.`, false);
      } else {
        showUser(user);
        updateStatus(`User session active for ${user.email}.`, false);
      }
    }

    async function loadCurrentAnnouncement() {
      const { data, error } = await supabase
        .from("announcements")
        .select("message")
        .eq("id", 1)
        .maybeSingle();

      if (error) {
        console.error("Announcement load failed:", error);
        return;
      }

      showAnnouncement(data?.message ?? "");
    }

    function subscribeToAnnouncements() {
      supabase
        .channel("live-announcements")
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "announcements"
          },
          (payload) => {
            if (payload.eventType === "DELETE") {
              showAnnouncement("");
              return;
            }

            showAnnouncement(payload.new?.message ?? "");
          }
        )
        .subscribe((status) => {
          if (status === "SUBSCRIBED") {
            console.log("Live announcement channel connected.");
          } else if (status === "CHANNEL_ERROR") {
            console.error("Realtime channel error.");
          }
        });
    }

    async function handleSignUp() {
      const email = $("email").value.trim();
      const password = $("password").value;
      const button = $("signupBtn");

      if (!email || !password) {
        updateStatus("Enter both an email address and password.");
        return;
      }

      if (password.length < 6) {
        updateStatus("Password must contain at least 6 characters.");
        return;
      }

      setLoading(button, true);
      updateStatus("Creating your account...");

      try {
        const { data, error } = await supabase.auth.signUp({
          email,
          password
        });

        if (error) {
          updateStatus(`Registration failed: ${error.message}`);
          return;
        }

        clearAuthInputs();

        if (data.session) {
          updateStatus("Account created and signed in.", false);
          await routeUser(data.user);
        } else {
          updateStatus(
            "Account created. Check your email and click the verification link before logging in.",
            false
          );
        }
      } catch (error) {
        updateStatus(`Registration error: ${error.message}`);
      } finally {
        setLoading(button, false);
      }
    }

    async function handleLogin() {
      const email = $("email").value.trim();
      const password = $("password").value;
      const button = $("loginBtn");

      if (!email || !password) {
        updateStatus("Enter both your email address and password.");
        return;
      }

      setLoading(button, true);
      updateStatus("Signing in...");

      try {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password
        });

        if (error) {
          updateStatus(`Login failed: ${error.message}`);
          return;
        }

        clearAuthInputs();
        await routeUser(data.user);
      } catch (error) {
        updateStatus(`Login error: ${error.message}`);
      } finally {
        setLoading(button, false);
      }
    }

    async function handleSignOut() {
      const { error } = await supabase.auth.signOut();

      if (error) {
        updateStatus(`Sign out failed: ${error.message}`);
        return;
      }

      showLoggedOut();
      updateStatus("Logged out successfully.", false);
    }

    async function executeBroadcast(message) {
      const { error } = await supabase
        .from("announcements")
        .update({ message })
        .eq("id", 1);

      if (error) {
        updateStatus(`Announcement update failed: ${error.message}`);
        return;
      }

      updateStatus(
        message
          ? "Announcement broadcast successfully."
          : "Announcement cleared successfully.",
        false
      );

      $("alertInput").value = message;
      showAnnouncement(message);
    }

    $("loginBtn").addEventListener("click", handleLogin);
    $("signupBtn").addEventListener("click", handleSignUp);
    $("userLogoutBtn").addEventListener("click", handleSignOut);
    $("adminLogoutBtn").addEventListener("click", handleSignOut);

    $("broadcastBtn").addEventListener("click", async () => {
      const message = $("alertInput").value.trim();

      if (!message) {
        updateStatus("Type an announcement before broadcasting.");
        return;
      }

      await executeBroadcast(message);
    });

    $("clearBtn").addEventListener("click", async () => {
      await executeBroadcast("");
    });

    // Restore a Supabase session after page refresh.
    const { data: { session } } = await supabase.auth.getSession();

    if (session?.user) {
      await routeUser(session.user);
    } else {
      showLoggedOut();
      updateStatus("Ready.", false);
    }

    // React to login/logout/session changes.
    supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        await routeUser(session.user);
      } else {
        showLoggedOut();
      }
    });

    await loadCurrentAnnouncement();
    subscribeToAnnouncements();