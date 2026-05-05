(function betaInterestInit() {
    const form = document.getElementById("beta-interest-form");
    const status = document.getElementById("beta-interest-status");
    if (!form || !status) {
        return;
    }

    const config = window.CIELORUMBO_SITE_CONFIG || {};
    const formUrl = String(config.interestFormUrl || "").trim();
    const interestEmail = String(config.interestEmail || "").trim();

    if (formUrl) {
        status.textContent = "Beta-interest form is ready.";
    } else if (interestEmail) {
        status.textContent = `Updates will open your email client to contact ${interestEmail}.`;
    }

    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const formData = new FormData(form);
        const payload = Object.fromEntries(formData.entries());

        if (formUrl) {
            status.textContent = "Sending request...";
            try {
                const response = await fetch(formUrl, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify(payload),
                });
                if (!response.ok) {
                    throw new Error(`Interest form failed with status ${response.status}`);
                }
                form.reset();
                status.textContent = "Thanks. Your beta-interest request was sent.";
                return;
            } catch (error) {
                status.textContent = error.message;
                return;
            }
        }

        if (interestEmail) {
            const subject = encodeURIComponent("CieloRumbo beta interest");
            const body = encodeURIComponent([
                `Name: ${payload.name || ""}`,
                `Email: ${payload.email || ""}`,
                `Role: ${payload.role || ""}`,
                "",
                `${payload.notes || ""}`,
            ].join("\n"));
            window.location.href = `mailto:${interestEmail}?subject=${subject}&body=${body}`;
            status.textContent = "Opening your email client...";
            return;
        }

        status.textContent = "Signup delivery is not configured yet. Follow the GitHub repo for updates.";
    });
})();
