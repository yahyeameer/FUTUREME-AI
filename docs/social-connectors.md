# Connected accounts: LinkedIn, X and Facebook

Without this, the future self only knows the few lines typed in onboarding. **Connected accounts** (`/connections`) lets you bring in what you've already written on LinkedIn, X and Facebook, so your future self gets your history right and speaks in your voice.

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

## For the demo

**Try sample data** imports a made-up LinkedIn and X history for the demo user, Hodan (`src/lib/social/sample.ts`), through the same parser as a real archive. It's marked *Sample* and deletes like anything else.

## Code

- `src/lib/social/zip.ts`: ZIP reader (stored, deflate, ZIP64) that reads only what it needs, in the browser and in Node
- `src/lib/social/parse.ts`, `extract.ts`: which files are read, and the parsers
- `src/lib/social/persona.ts`: persona, its prompt block and vault note
- `src/lib/social/store.ts`: import, delete, search, persona rebuild
- `src/lib/social/oauth.ts`, `secrets.ts`: sign-in and token encryption
- `src/app/api/connections`: the page's API and the OAuth callback
- `src/features/connections/connections.tsx`: the page
- `tests/social.test.ts`
