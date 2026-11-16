/**
 * Privacy policy served at /privacy (both app stores ask for a public URL).
 * This describes what the code actually does. Have it reviewed by a lawyer before launch.
 */
export function privacyHtml(contact: string): string {
  const email = contact || 'privacy@your-domain.example';
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>RoadPals Privacy Policy</title>
<style>body{font-family:system-ui,sans-serif;max-width:720px;margin:0 auto;padding:24px;line-height:1.6;color:#1f2a37}h1{font-size:28px}h2{font-size:19px;margin-top:28px}li{margin:4px 0}.muted{color:#6b7686}</style></head><body>
<h1>RoadPals Privacy Policy</h1>
<p class="muted">Last updated: ${new Date().toISOString().slice(0, 10)}</p>
<p>RoadPals is a driving app where you earn points for driving, passing other drivers, waving and reporting road hazards. This page explains what we collect, why, and how to delete it.</p>

<h2>What we collect</h2>
<ul>
<li><b>Account:</b> your phone number (to sign you in by text message), the driver name you choose, your vehicle type and brand, and your time zone.</li>
<li><b>Location while you drive:</b> when you start a drive, the app sends your GPS position every few seconds, including in the background until you end the drive. We do not track you when no drive is active.</li>
<li><b>Activity:</b> points you earn and spend, drivers you have passed (and how many times), waves, hazard reports and confirmations, place check-ins, map suggestions, team membership and purchases in the rewards shop.</li>
</ul>

<h2>How we use it</h2>
<ul>
<li>To count kilometres, detect when you pass or drive near other drivers, show nearby hazards and award points.</li>
<li>To show you on the live map to other RoadPals drivers within about 1.5 km: your driver name, vehicle type, brand colour and position. You disappear from the map about a minute after you stop sending positions.</li>
<li>To prevent cheating (for example, rejecting fake GPS) and to run leaderboards, teams and rewards.</li>
</ul>

<h2>What we keep</h2>
<ul>
<li>Your latest position is kept for up to one hour. We do not keep a history of your routes.</li>
<li>We keep totals (distance driven) and the ~150 m map areas you have driven through, which is how the “new area explored” rule works.</li>
<li>Points history, passes, check-ins and purchases are kept until you delete your account. Unused points expire after a year without driving.</li>
<li>Hazard reports you made stay on the map for a limited time and are not linked to you after you delete your account.</li>
</ul>

<h2>Who we share it with</h2>
<ul>
<li>Other drivers see what is described above. We do not sell your data.</li>
<li>Service providers that run the app for us: hosting (servers and databases) and our text-message provider, which receives your phone number to send sign-in codes.</li>
<li>Reward partners only receive a coupon code you choose to redeem, not your location or phone number.</li>
</ul>

<h2>Your choices</h2>
<ul>
<li><b>Location:</b> you can end a drive at any time, or turn off location access in your phone settings.</li>
<li><b>Delete your account:</b> in the app, go to <b>Me → Delete account</b>. This permanently deletes your account, points, passes, purchases and live data.</li>
<li>Questions or requests: <a href="mailto:${email}">${email}</a></li>
</ul>

<h2>Safety</h2>
<p>Don’t use your phone while driving. Waving is locked while the car is moving unless Passenger mode is on.</p>
</body></html>`;
}
