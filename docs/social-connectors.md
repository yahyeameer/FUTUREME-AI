# Connected accounts: LinkedIn, X, Facebook, Instagram, TikTok and YouTube

Without this, the future self only knows the few lines typed in onboarding. **Connected accounts** (`/connections`) lets you bring in what you've already written on LinkedIn, X and Facebook (from their data exports) and on Instagram, TikTok and YouTube (from your public profile), so your future self gets your history right and speaks in your voice.

## What happens

1. **You choose and agree.** Nothing is imported without ticking the consent box, every time. The dialog says what is read and what never is.
2. **Your archive is read in your browser.** FutureMe opens the `.zip` on your device and picks out only your profile, career, education, skills and the posts you wrote. Messages, connections, contacts, photos, ads, location history and other people's posts stay on your device; they never reach the server. Multi-gigabyte X archives are fine: only three small files are read.
3. **You see it before it's sent.** A preview shows each account, the counts, a sample post, and how many files were left unread.
4. **It goes into your vault.** Each platform becomes notes in the vault's `Social/` folder (a profile note, and posts by year), readable and editable in Obsidian. A **persona** is built from them (`Social/persona-from-your-accounts.md`): current role, past roles, education, skills, the topics you post about most, how you write (counted from your posts, plus a two-sentence summary by Nemotron), and a few posts in your own words.
5. **The future self uses it.** A short persona block is added to the future self's instructions on every turn (the page shows it word for word under *Show exactly what it's told*), and voice-twin calls with you use it too. Two MCP tools on `mcp/futureme-server.ts` give the agent the details:
   - `search_social`: searches your imported posts, roles and profile, optionally on one platform, and returns dated posts with links. Its citations are the vault notes, so the fact checker and "Remembered" chips work as with any memory.
   - `get_persona`: returns the whole persona.
   Imported notes are also found by the ordinary `search_memory`.
6. **Before and after.** The page asks your future self the same question twice, same model, tools off on both sides: once with only your onboarding answers, once with the persona. Nothing is saved to your conversation.
7. **Delete any time.** Delete one platform or everything: its notes, its part of the persona, and any saved sign-in (revoked at the platform).

## Getting your export

| Platform | Where | Notes |
| --- | --- | --- |
| LinkedIn | [Settings → Data privacy → Get a copy of your data](https://www.linkedin.com/mypreferences/d/download-my-data) | The larger archive, or at least Profile, Positions, Education, Skills and Shares. Read: `Profile.csv`, `Positions.csv`, `Education.csv`, `Skills.csv`, `Shares.csv`, `Certifications.csv`, `Languages.csv`. Address, birth date and connections are not kept. |
| X | [Settings → Your account → Download an archive of your data](https://x.com/settings/download_your_data) | Read: `data/account.js` (handle and display name only, not email or phone), `data/profile.js`, `data/tweets.js`. Reposts of other people are skipped; shortened links are expanded. |
| Facebook | [Accounts Center → Download your information](https://accountscenter.facebook.com/info_and_permissions/dyi) | Choose **JSON**, with Posts and Personal information. Read: `profile_information.json`, `your_posts*.json`. Facebook's escaped text ("cafÃ©") is repaired. |

You can pick the `.zip` itself, several at once, or individual files from inside it.

## Signing in instead (optional)

Where a platform lets a personal app read your own data, there's also a **Sign in** button. It's narrower than the export, so the export stays the main path:

| Platform | What sign-in can read | Set up |
| --- | --- | --- |
| X | Profile and your 100 most recent posts (OAuth 2.0 with PKCE, scopes `tweet.read users.read offline.access`). The free API tier allows very few reads a month. | Create an app at developer.x.com with OAuth 2.0 on, type *Web App*. Set `X_CLIENT_ID` (and `X_CLIENT_SECRET` for a confidential client). |
| LinkedIn | Your name only (Sign In with LinkedIn using OpenID Connect). Posts and career need LinkedIn partner programs, so import the export for those. | Add the *Sign In with LinkedIn using OpenID Connect* product. Set `LINKEDIN_CLIENT_ID` and `LINKEDIN_CLIENT_SECRET`. |
| Facebook | Your name and up to 500 of your own posts (`user_posts`). Without App Review this works only for people with a role on the app, which is fine for your own FutureMe. | Create a Meta app with Facebook Login, add yourself as admin or tester. Set `FACEBOOK_APP_ID` and `FACEBOOK_APP_SECRET`. |

Register this redirect URL with each platform: `https://<your FutureMe address>/api/connections/oauth/<x|linkedin|facebook>/callback`. Set `FUTUREME_PUBLIC_URL` to that address when FutureMe runs behind a proxy or on a domain.

**Tokens are never stored in plain text.** They're encrypted with AES-256-GCM before they reach SQLite. The key comes from `FUTUREME_SECRET_KEY`, or is generated once into `secret.key` next to the database (mode 600). The key never enters the database, so the Supabase copy (docs/supabase.md) only ever holds ciphertext. Changing the key means connecting again; nothing leaks. **Sync** fetches again (refreshing the X token when it has expired); **Disconnect** revokes the token at the platform and forgets it, keeping what was imported until you delete it.

## Fetching a public profile (Apify)

Instagram, TikTok and YouTube have no export FutureMe can read, and exports take a day to arrive. So with `APIFY_TOKEN` set, every card also has **Fetch public profile**, which runs an [Apify](https://apify.com) actor through Apify's hosted MCP server (`https://mcp.apify.com`, tools `call-actor`, `get-actor-run`, `get-dataset-items`), falling back to Apify's REST API if MCP can't be reached (or always, with `APIFY_TRANSPORT=rest`).

| Platform | Actor | What's fetched |
| --- | --- | --- |
| Instagram | `apify/instagram-profile-scraper` | Bio, name, link, captions of the latest posts |
| TikTok | `clockworks/tiktok-profile-scraper` | Bio, name, link, captions of the latest 60 videos |
| YouTube | `streamers/youtube-channel-scraper` | Channel name, description, location, latest 50 video titles |
| X | `apidojo/tweet-scraper` | Bio, name, location, latest 100 posts (only the account's own; reposts skipped) |
| LinkedIn | `harvestapi/linkedin-profile-scraper`, then `harvestapi/linkedin-profile-posts` | Headline, About, experience, education, skills, languages; then the latest 50 posts |
| Facebook | `apify/facebook-posts-scraper` | Latest 50 posts on a public **Page**. Personal profiles are refused: use the export. |

Every run is capped at its item count, 120 seconds and $0.25 (`maxTotalChargeUsd`). The MCP connection loads only the one actor being run. The token stays on the server; the agent has no tool that fetches profiles, and the MCP server FutureMe exposes doesn't either.

### Only your own accounts

Anyone can type someone else's username, so a fetch only counts once you've shown the account is yours (`src/lib/social/claims.ts`):

1. You name the account and agree it's yours. FutureMe makes a one-time code like `FM-7KQ2MX`.
2. You put the code where only the owner can: your bio (Instagram, TikTok, X, or a new post there), your headline or About (LinkedIn), your channel description (YouTube), or a new post on the Page (Facebook).
3. **Check** fetches the account and looks for the code. Not there: everything fetched is thrown away, nothing is stored or shown, and you're told where to put it. There: the account is verified, and only then is anything else fetched (LinkedIn's posts).
4. You see what was fetched (counts and a sample post) and choose **Import**. The code is removed from the imported text, so it doesn't end up in your persona, and you can take it off the account.

Codes expire after 24 hours and allow 5 checks; at most 5 accounts per platform can be tried a day; one claim per platform. The scraper's answer has to be the named account too (a different username, a private account, or other people's posts in an X search are refused or dropped). A verified account can be fetched again for 30 days without a new code. Deleting a platform deletes its verification.

## For the demo

**Try sample data** imports a made-up LinkedIn and X history for the demo user, Hodan (`src/lib/social/sample.ts`), through the same parser as a real archive. It's marked *Sample* and deletes like anything else.

## Code

- `src/lib/social/zip.ts`: ZIP reader (stored, deflate, ZIP64) that reads only what it needs, in the browser and in Node
- `src/lib/social/parse.ts`, `extract.ts`: which files are read, and the parsers
- `src/lib/social/persona.ts`: persona, its prompt block and vault note
- `src/lib/social/store.ts`: import, delete, search, persona rebuild
- `src/lib/social/oauth.ts`, `secrets.ts`: sign-in and token encryption
- `src/lib/social/apify.ts`, `claims.ts`: public-profile fetch over Apify MCP, and the ownership check
- `src/app/api/connections`: the page's API and the OAuth callback
- `src/features/connections/connections.tsx`: the page
- `tests/social.test.ts`, `tests/social-fetch.test.ts`
