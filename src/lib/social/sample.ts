import type { ExportFile } from "./parse";

// Sample export files for the demo user (Hodan, see scripts/seed-demo.ts), in the exact formats LinkedIn and X use.
// "Try with sample data" runs them through the same parser as a real archive. They describe a made-up person.

const tweet = (id: string, date: string, text: string, likes: number, retweets: number, reply = false) => ({
  tweet: {
    id_str: id,
    created_at: date,
    full_text: text,
    favorite_count: String(likes),
    retweet_count: String(retweets),
    ...(reply ? { in_reply_to_status_id_str: "1" } : {}),
    entities: { urls: [] },
  },
});

const TWEETS = [
  tweet("1830000000000000001", "Mon Sep 08 18:42:10 +0000 2025", "Shipped a tiny agent tonight that reads SMS crop prices from three markets in Somaliland and answers 'where should I sell?' in Somali. 140 lines of TypeScript. Farmers don't need dashboards, they need answers.", 212, 48),
  tweet("1830000000000000002", "Sat Aug 23 07:15:00 +0000 2025", "No GPU, no problem: quantised a 3B model and it runs on the old office laptop. Slow, but it runs. Constraints are a design brief.", 96, 14),
  tweet("1830000000000000003", "Thu Jul 31 20:05:44 +0000 2025", "Hot take: the best AI product in the Horn of Africa this year will be boring. Receipts, invoices, prices. Not chatbots.", 340, 71),
  tweet("1830000000000000004", "Tue Jun 17 16:30:00 +0000 2025", "Two hours every evening. That's the whole secret. Some nights it's 20 lines of code, some nights it's reading one paper slowly.", 158, 22),
  tweet("1830000000000000005", "Fri May 02 11:11:11 +0000 2025", "Ran my first workshop for 14 students in Hargeisa: build an agent in 90 minutes. Three of them shipped. One of them is 16. The future is fine.", 421, 96),
  tweet("1830000000000000006", "Wed Apr 09 21:47:03 +0000 2025", "Somali is a low-resource language only because nobody bothered. We have radio archives, poetry, SMS. Starting a small open dataset this month.", 287, 83),
  tweet("1830000000000000007", "Sun Mar 16 09:02:55 +0000 2025", "@amina_codes exactly. Ship the ugly version first, then ask users.", 12, 0, true),
  tweet("1830000000000000008", "Mon Feb 10 19:20:00 +0000 2025", "Read 'Attention is all you need' for the third time. This time I actually understood the positional encoding part. Slow is fine.", 77, 9),
  tweet("1830000000000000009", "Thu Jan 09 17:45:30 +0000 2025", "2025 goal: publish one small piece of research, even if it's a workshop paper. Writing it here so you can hold me to it.", 190, 18),
  tweet("1830000000000000010", "Sat Dec 14 14:14:14 +0000 2024", "Fintech lesson of the year: every 'edge case' is somebody's normal Tuesday. Mobile money reversals taught me humility.", 133, 20),
];

const shares = [
  ["2025-09-10 08:30:00", "https://www.linkedin.com/feed/update/urn:li:activity:7001", "Proud to share a weekend project: a Somali-language assistant that helps farmers compare crop prices over SMS. It runs on a laptop, costs almost nothing, and it's open source.\n\nIf you work on agriculture or language tech in the Horn of Africa, I'd love to talk."],
  ["2025-05-03 12:00:00", "https://www.linkedin.com/feed/update/urn:li:activity:7002", "Yesterday 14 students in Hargeisa built their first AI agents with me in a 90-minute workshop. Three shipped something real.\n\nThank you to my mentor in Nairobi who told me to teach what I'm still learning. It works."],
  ["2025-01-12 09:15:00", "https://www.linkedin.com/feed/update/urn:li:activity:7003", "This year I want to publish my first research paper, on building datasets for low-resource languages like Somali. I'm looking for a co-author and a reviewer. Who's in?"],
  ["2024-11-20 18:00:00", "https://www.linkedin.com/feed/update/urn:li:activity:7004", "Three years at Dahab Pay. We moved our reconciliation from nightly batches to near real time, and support tickets dropped by a third. Grateful for a team that sweats the details."],
];

const csv = (rows: string[][]) => rows.map((r) => r.map((c) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(",")).join("\n");

export const SAMPLE_FILES: ExportFile[] = [
  {
    name: "Basic_LinkedInDataExport/Profile.csv",
    text: csv([
      ["First Name", "Last Name", "Maiden Name", "Address", "Birth Date", "Headline", "Summary", "Industry", "Zip Code", "Geo Location", "Twitter Handles", "Websites", "Instant Messengers"],
      [
        "Hodan",
        "Warsame",
        "",
        "",
        "",
        "Full-stack developer · AI agents for farmers and small businesses · Hargeisa",
        "I build payment systems by day and small AI agents by night. I care about tools that work offline, in Somali, on cheap hardware.",
        "Financial Services",
        "",
        "Hargeisa, Somaliland",
        "[hodan_builds]",
        "[PORTFOLIO:https://hodan.dev]",
        "",
      ],
    ]),
  },
  {
    name: "Basic_LinkedInDataExport/Positions.csv",
    text: csv([
      ["Company Name", "Title", "Description", "Location", "Started On", "Finished On"],
      ["Dahab Pay", "Full-Stack Developer", "Mobile money reconciliation, merchant dashboards, TypeScript and Postgres.", "Hargeisa", "Oct 2021", ""],
      ["Hargeisa Tech Hub", "Volunteer Instructor", "Weekend coding and AI workshops for students.", "Hargeisa", "Mar 2024", ""],
      ["Freelance", "Web Developer", "Websites and booking systems for local shops.", "Remote", "Jun 2019", "Sep 2021"],
    ]),
  },
  {
    name: "Basic_LinkedInDataExport/Education.csv",
    text: csv([
      ["School Name", "Start Date", "End Date", "Notes", "Degree Name", "Activities"],
      ["University of Hargeisa", "2015", "2019", "", "BSc Computer Science", "Programming club"],
    ]),
  },
  {
    name: "Basic_LinkedInDataExport/Skills.csv",
    text: csv([["Name"], ["TypeScript"], ["Node.js"], ["PostgreSQL"], ["React"], ["Machine Learning"], ["LLM Agents"], ["Teaching"], ["Payments"]]),
  },
  {
    name: "Basic_LinkedInDataExport/Shares.csv",
    text: csv([["Date", "ShareLink", "ShareCommentary", "SharedUrl", "MediaUrl", "Visibility"], ...shares.map(([d, l, c]) => [d, l, c, "", "", "MEMBER_NETWORK"])]),
  },
  {
    name: "twitter-2025-09-30/data/account.js",
    text: `window.YTD.account.part0 = ${JSON.stringify([{ account: { email: "not-kept@example.com", username: "hodan_builds", accountId: "42", createdAt: "2016-02-01T10:00:00.000Z", accountDisplayName: "Hodan 🌱" } }], null, 2)}`,
  },
  {
    name: "twitter-2025-09-30/data/profile.js",
    text: `window.YTD.profile.part0 = ${JSON.stringify([{ profile: { description: { bio: "Building small AI tools for farmers and shops in Somaliland. Payments by day. Somali NLP by night.", website: "https://hodan.dev", location: "Hargeisa" } } }])}`,
  },
  {
    name: "twitter-2025-09-30/data/tweets.js",
    text: `window.YTD.tweets.part0 = ${JSON.stringify(TWEETS, null, 2)}`,
  },
  // Files a real archive has that FutureMe never reads.
  { name: "twitter-2025-09-30/data/direct-messages.js", text: "window.YTD.direct_messages.part0 = []" },
  { name: "Basic_LinkedInDataExport/Connections.csv", text: "First Name,Last Name\nA,B" },
];
