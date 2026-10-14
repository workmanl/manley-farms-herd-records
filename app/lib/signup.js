// SPDX-License-Identifier: AGPL-3.0-only
import { APP_VERSION } from "./database.js";
const SIGNUP_URL = "https://northwestmediasystems.com/api/capture.php";
const OFFLINE = "You're offline. Try again when you have signal.";
export function setupNewsSignup(document, {
  fetch: send = (...args) => globalThis.fetch(...args),
  navigator = document.defaultView.navigator,
  location = document.defaultView.location,
} = {}) {
  const form = document.getElementById("news-signup-form");
  if (!form) return;
  const input = form.querySelector('input[type="email"]');
  const button = form.querySelector('button[type="submit"]');
  const status = document.getElementById("news-status");
  let sending = false;
  document.getElementById("news-signup-link")?.addEventListener("click", (event) => {
    event.preventDefault();
    document.getElementById("public-intro").open = true;
    document.getElementById("news-signup").scrollIntoView?.({ block: "center" });
    input.focus({ preventScroll: true });
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (sending) return;
    if (navigator.onLine === false) {
      status.textContent = OFFLINE;
      return;
    }
    input.value = input.value.trim();
    if (!input.checkValidity()) {
      input.setAttribute("aria-invalid", "true");
      status.textContent = "Enter a valid email address.";
      input.focus();
      return;
    }
    input.removeAttribute("aria-invalid");
    sending = true;
    button.disabled = true;
    button.textContent = "Sending...";
    status.textContent = "";
    try {
      const response = await send(SIGNUP_URL, {
        method: "POST",
        credentials: "omit",
        redirect: "error",
        referrerPolicy: "no-referrer",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: input.value,
          brand: "manleyfarms",
          source: "herd_records_signup",
          metadata: { path: location.pathname, appVersion: APP_VERSION },
        }),
      });
      if (!response.ok) throw Error("Signup failed");
      await response.json();
      status.textContent = "You're on the list.";
      input.value = "";
    } catch {
      status.textContent = navigator.onLine === false
        ? OFFLINE : "Something went wrong. Please try again.";
    } finally {
      sending = false;
      button.disabled = false;
      button.textContent = "Sign me up.";
    }
  });
}
