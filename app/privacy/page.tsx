import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy — Calocount",
  description: "Privacy policy for the Calocount personal meal logging service.",
};

export default function PrivacyPage() {
  return (
    <main className="app-shell">
      <article className="settings-panel" aria-labelledby="privacy-policy-title">
        <header className="date-heading">
          <p className="eyebrow">Calocount</p>
          <h1 id="privacy-policy-title">Privacy Policy</h1>
          <p>
            Effective date: <time dateTime="2026-08-30">August 30, 2026</time>
          </p>
        </header>

        <section aria-labelledby="about-service">
          <h2 id="about-service">About this service</h2>
          <p>Calocount is a personal, single-user meal logging service operated for private use.</p>
        </section>

        <section aria-labelledby="information-processed">
          <h2 id="information-processed">Information we process</h2>
          <p>We process the following information when you use the service:</p>
          <ul>
            <li>Meal name, calories, protein, carbohydrates, fat, and eaten time.</li>
            <li>An optional meal photo that you upload with a meal.</li>
          </ul>
        </section>

        <section aria-labelledby="how-information-is-used">
          <h2 id="how-information-is-used">How we use information</h2>
          <p>
            We use this information only to provide, maintain, and secure the meal logging service. We do not sell
            data or share it for advertising.
          </p>
        </section>

        <section aria-labelledby="storage">
          <h2 id="storage">Storage and temporary file links</h2>
          <p>
            Meal records are stored in Cloudflare D1. Optional meal photos are stored in Cloudflare R2. Temporary
            OpenAI file links are downloaded immediately for processing and are not retained by this service.
          </p>
        </section>

        <section aria-labelledby="retention">
          <h2 id="retention">Retention</h2>
          <p>We retain data until you delete it or it is no longer needed for the service.</p>
        </section>

        <section aria-labelledby="security">
          <h2 id="security">Security</h2>
          <p>We use HTTPS and access controls to protect data, but no system can be guaranteed completely secure.</p>
        </section>

        <section aria-labelledby="your-choices">
          <h2 id="your-choices">Your choices</h2>
          <p>
            You can request access to, correction of, or deletion of your data through the service operator.
          </p>
        </section>
      </article>
    </main>
  );
}
