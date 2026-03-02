# AccessVoice — Demo Video Script (~3 minutes)

> Upload to YouTube (unlisted). Include **#AmazonNova** in the title and description.
> Title suggestion: "AccessVoice — Voice-Driven Web Browser for Accessibility | #AmazonNova"

---

## 0:00–0:25 — The Problem (25s)

**Narration:**
"2.2 billion people worldwide have vision impairments. Today, browsing the web means learning complex screen reader shortcuts and navigating page elements one by one. Something as simple as searching for an apartment can take 15 minutes of Tab-Tab-Tab through menus. AccessVoice changes that — browse any website just by talking."

**On screen:**
- Brief shot of a traditional screen reader experience (optional)
- AccessVoice Chrome Extension icon → click to open sidepanel
- Show the clean starting UI

---

## 0:25–0:40 — How It Works (15s)

**Narration:**
"AccessVoice is a Chrome Extension powered by two Amazon Nova models. Nova Sonic handles real-time voice conversation. Nova 2 Lite sees the page through screenshots and decides what to click, type, and scroll — like a sighted assistant sitting beside you."

**On screen:**
- Show the architecture diagram briefly (2-3 seconds)
- Show the "Start Session" button being clicked
- Status changes to "Connected — listening..."

---

## 0:40–1:25 — Scenario 1: Apartment Search (45s)

**Narration:**
"Let's search for apartments. I'll type a command — you could also just speak it."

**Action:** Type "Search for 2 bedroom apartments in Seattle on Apartments.com"

**Narration (while browsing):**
"Watch the browser — Nova 2 Lite is analyzing screenshots and navigating Apartments.com autonomously. It navigates to the site, enters the search criteria, and browses the results. Each step is a screenshot-analyze-act loop."

**Narration (after results):**
"And here are the results — spoken back as a natural summary with the browser screenshot showing what was found."

**On screen:**
- Text input → send command
- Browser view showing live screenshots as AccessVoice navigates
- Transcript showing the AI's spoken response
- Final result screenshot from Apartments.com

---

## 1:25–2:05 — Scenario 2: Amazon Shopping (40s)

**Narration:**
"Now let's try shopping. 'Find a winter jacket on Amazon under $100.'"

**Action:** Type or speak the Amazon command

**Narration (while browsing):**
"Same flow — AccessVoice navigates to Amazon, searches for jackets, applies the price filter, and reads the top results back. This works on ANY website. No special configuration per site."

**On screen:**
- Command sent
- Live browsing screenshots (Amazon navigation)
- Results spoken + displayed in transcript

---

## 2:05–2:30 — Scenario 3: News Reading (25s)

**Narration:**
"One more — reading the news. 'What's the latest news on CNN?'"

**Action:** Send CNN command

**Narration:**
"AccessVoice navigates to CNN, reads the headlines and top stories, and summarizes them conversationally. No more element-by-element navigation through news sites."

**On screen:**
- CNN browsing in action
- Spoken summary in transcript

---

## 2:30–2:50 — Technical Highlights (20s)

**Narration:**
"Under the hood: Nova Sonic streams bidirectional audio with sub-700ms latency. Nova 2 Lite analyzes each screenshot and returns structured actions — click this button, type in this field, scroll down. The extension executes these in your own browser, so it works with your logins, your bookmarks, your preferences. No cloud browser needed."

**On screen:**
- Quick flash of architecture diagram
- Highlight the action loop: Screenshot → Nova 2 Lite → Action → Repeat
- Show that it's running in the user's own Chrome tab

---

## 2:50–3:00 — Closing (10s)

**Narration:**
"AccessVoice — browse the web with your voice, not your eyes. Built with Amazon Nova Sonic and Nova 2 Lite for the Amazon Nova AI Hackathon."

**On screen:**
- AccessVoice logo/title card
- Tech stack badges: Nova Sonic, Nova 2 Lite, Strands SDK, Chrome Extension
- GitHub URL
- #AmazonNova

---

## Recording Notes

- **Resolution**: 1920x1080 @ 30fps
- **Audio**: Clear narration, minimal background noise
- **Existing recording**: `demo-recording/accessvoice-demo-narrated.mp4` (243MB, ~2:50)
  - Review timestamps in `demo-recording/timestamps.json`
  - The existing video covers all 3 scenarios (Apartments, Amazon, CNN)
  - May need re-recording if narration doesn't match this script
- **Upload**: YouTube unlisted → copy URL → paste in Devpost "Video Demo" field
- **Hashtag**: #AmazonNova MUST appear in YouTube title or description
