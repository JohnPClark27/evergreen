# Validation

> Roles only: no names, no resident details. Quotes are short and lightly trimmed. Full
> transcripts are kept by the team and are not in this repo.

**Date(s):** October 3, 2026 (two on-site conversations, each with a hands-on demo)
**Setting:** a senior living community of about 50 residents, most in their 80s; the
interviews were in the building
**Version tested:** the `studio` branch preview as of Oct 3 (study plans built from hymn,
Scripture, prayer, note, quiz and Finish the Line modules; Aide tools; the Studio plan builder).
Read-aloud wasn't working in that build.
**Device(s):** a team member's laptop, tapped by the interviewee. The building's Wi-Fi failed in
both demos, and we finished on a phone hotspot.

---

## Assumptions before

| # | Assumption | How we'd know it's wrong |
|---|---|---|
| A1 | Older adults, Christian or not, like to listen to hymns. | Staff or residents say hymns don't draw people, or only draw the already devout. |
| A2 | Older adults can use technology to reach a devotional on their own. | Staff say residents need help to start, or residents struggle with phones, tablets or Wi-Fi. |
| A3 | Residents can find their way with on-screen buttons. | People get lost, press the wrong thing, or can't see or reach the buttons. |
| A4 | Older adults have no concerns about AI. | Anyone raises AI as a worry, or the AI gets in the way of the devotion. |

## Who we met (roles only)

| Role | Number | Context (how long, where) |
|---|---|---|
| Executive director of the community (about 10 years in the role) | 1 | Interview, then he walked through the study plans, Aide tools and plan builder himself |
| Retired pastor who lives in the community (about a year) | 1 | Interview about his devotional habits and his neighbors, then a guided demo |

## What we learned

**Hymns**
- The director: "They love it." A hymn night draws 20 to 25 of about 50 residents, with a staff
  member on piano. He calls it music therapy: "some of those songs, they just... they remember."
- Hymns cross denominations (Catholic, Baptist, Wesleyan, United Methodist) and reach people
  "on the edge" of faith.
- The pastor: older believers "long for something that warms our hearts." His church moved from
  hymnals to a band almost overnight, and he can't follow the new music.
- But hymns land with "those who have been raised with them." He added: "It's amazing how many
  people don't even know what a hymn is anymore." During the demo he said, "that's not even the
  tune I learned."

**Using technology**
- The director: some residents use phones, computers or Alexa; "some still struggle with that."
  Most just use a printed Bible.
- Ten years ago residents didn't want Wi-Fi. Now "that's one of the first questions residents now
  ask." Comfort is growing, but "do they mess up their phones? Yes, yes, they do."
- Their yearly resident survey is on a touchscreen. "Quite a few can do touchscreen, as long as the
  words are big enough and it's pretty basic," but staff often have to get it started.
- Wi-Fi in the building dropped during both demos. We couldn't load content until we switched to
  a hotspot.

**Seeing, hearing and buttons**
- Vision is "the big issue": residents "can't read like they used to" and get frustrated. "Most of
  them need it spoken to them."
- The pastor: "Most of them can't hear," some can't walk, and some can't read. One resident who
  can't read was given a Bible by his son; the pastor said this app "would be perfect for somebody
  like him."
- The director: keep labels explicit ("click here to hear the hymn"). Residents press the wrong
  TV button and get stuck until staff fix it.
- A few residents have use of only one arm. He wondered about voice control.
- The pastor found the demo easy: "Not at all [difficult]. I'm not computer savvy." The director
  liked the big text, the sheet music, and replay ("sometimes you might wanna read it a couple
  times").

**Feelings, guidance and tone**
- Residents "carry a lot of burden" and get lonely. The director asked whether there is something
  for a resident who is discouraged or grieving.
- The pastor: it works best "in the right hands," used alongside a guide. It must never feel like a
  conversion pitch: "let the Holy Spirit use that."
- The pastor: residents "sit and talk all day." The community is adding an interactive bingo program.

**AI**
- Neither person raised AI, for or against. We didn't ask directly, so we have little evidence
  either way.

## What was wrong

| Assumption | What actually happened |
|---|---|
| A1 Hymns | **Held, with a limit.** Strong pull for people raised on hymns, including some outside the church. But it isn't universal: younger or unchurched people may not know hymns, and tunes vary by tradition. |
| A2 Technology | **Partly wrong.** Some residents can, many can't, and most need someone to get them started. Wi-Fi is now expected but not reliable (it failed in both demos). |
| A3 Buttons | **Partly wrong.** Buttons work only if they're large, few and explicitly labeled. Many residents can't see or read the screen well, wrong taps strand people, and some can't tap easily at all. |
| A4 AI | **Untested.** No concerns came up, but we didn't ask. We decided the AI should work quietly and never be something a resident has to deal with. |

## What we changed

| Change | Why (which finding) | Commit / PR |
|---|---|---|
| Large sans-serif type, extra line spacing, high contrast, no italics | A3: failing vision is the top frustration | `2622a3f` |
| Big Back and Next arrows beside the card; Sing again, Pause and sheet music joined below it | A3: older testers couldn't find Back/Next in the bottom bar; the director liked replay | `d48b4bd`, `007f818`, `c50b26b` |
| One-tap 👍 / 👎 buttons instead of worded choices | A3: fewer words, bigger targets | `dfffd3d` |
| A **Read aloud** button on every passage and prayer | A3: "most of them need it spoken to them" | `90a535a` |
| "My Day" or "Back to engage" in the same corner of every screen | A3: wrong taps strand people | `90a535a`, `6819bab` |
| Start with "How are you feeling today?" (five faces); Gloo AI then picks a verse of the day and four hymns, prayers, readings or games to fit | Residents carry burdens and loneliness; the director asked about help for discouragement and grief | `dac0b68`, `77165b9` |
| The AI runs behind one tap: no chat or setup. If it's down or slow (10 s / 5 s) the tablet quietly uses a random pick | A4: keep AI out of the way. A2: Wi-Fi and services aren't reliable | `9723f58`, `e73fb31` |
| AI only a small ✦ mark for residents; its reasoning shows only in Aide tools | A4: invisible to residents, clear to aides and judges | `ff2b896` |
| Pastors and admins edit the AI's guidance in the Studio. It picks gentle, familiar passages and never writes Scripture | "Let the Holy Spirit use it": no pressure, people in charge of the theology | `ff2b896` |
| Gentle Scripture games (word search, crossword, trivia), no scores | Residents "sit and talk all day"; the community is adding activities like bingo | `7f77b07` |
| Kept: hymn first in each study, aide alongside, no resident accounts | A1 held; A2 showed staff help residents start | (design unchanged) |

**Heard but not built yet**
- **Family-built plans:** an adult child sets up a 30-day plan for a parent. The director said he'd
  use it himself.
- **New Living Translation:** the pastor's pick for residents. We use the ASV, which is public
  domain and available to us through YouVersion today.
- **A group or TV mode** for a daily devotional in the activity room, plus a short intro showing
  residents how it works.
- **Voice control** for residents who can't tap easily.
- **A natural reading voice:** the devices' built-in voices sound robotic (see README, Known gaps).
- **Offline use** for when the Wi-Fi drops.
- **"Bible stories 101"** and a beginner path in the Gospel of John, for late-life believers.
